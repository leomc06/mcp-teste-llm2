import http from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createMcpClient } from "./mcp-client.js";
import { createAnthropicClient } from "./llm-client.js";
import { interpretQuestion } from "./llm-router.js";
import { AgentError, runCompare, runDecidedTool } from "./agent-loop.js";
import { routeTicketQuestion } from "./tickets-routing.js";
import { isCapabilityQuestion, isExternalActionRequest, isWriteRequest } from "./write-policy.js";
import { detectsContinuation, mergeContinuation } from "./continuation.js";
import { serveStaticFile } from "./static-files.js";
import { createRateLimiter } from "./rate-limiter.js";

const configSchema = z.object({
  AGENT_HOST: z.string().min(1),
  AGENT_PORT: z.coerce.number().int().min(1).max(65535),
  AGENT_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(300000),
  AGENT_MAX_CONCURRENT_REQUESTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(10),
  // Limite de taxa por IP (janela deslizante, ver agent/rate-limiter.js) —
  // independente do limite de concorrência acima, que só olha quantas
  // requisições estão em andamento ao mesmo tempo, não quantas por minuto.
  AGENT_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(3600000)
    .default(60000),
  AGENT_RATE_LIMIT_MAX_REQUESTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(30),
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().min(1).max(100).default("claude-haiku-5-5"),
  ANTHROPIC_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(300000)
    .default(20000),
});

const config = configSchema.parse(process.env);

const projectDir = fileURLToPath(new URL("../", import.meta.url));
const webDir = fileURLToPath(new URL("../web/", import.meta.url));

let mcp;

try {
  mcp = await createMcpClient({ projectDir });
} catch {
  console.error("Não foi possível conectar ao servidor MCP.");
  process.exit(1);
}

const llm = createAnthropicClient({
  apiKey: config.ANTHROPIC_API_KEY,
  model: config.ANTHROPIC_MODEL,
  timeoutMs: config.ANTHROPIC_TIMEOUT_MS,
});

const llmTools = llm.formatTools(mcp.tools);

const requestSchema = z
  .object({
    pergunta: z.string().trim().min(1).max(2000),
    // Opcional — a pergunta "efetiva" (já com continuação anterior
    // mesclada, se houve) devolvida na resposta anterior. Mesmo teto de
    // `pergunta`: a concatenação das duas fica em ~4000 caracteres, bem
    // dentro do que o modelo local processa sem problema.
    perguntaAnterior: z.string().trim().max(2000).optional(),
  })
  .strict();

const userIdSchema = z.string().trim().min(1).max(100);
let activeAgentRequests = 0;

const rateLimiter = createRateLimiter({
  windowMs: config.AGENT_RATE_LIMIT_WINDOW_MS,
  maxRequests: config.AGENT_RATE_LIMIT_MAX_REQUESTS,
});

const rateLimiterPruneInterval = setInterval(
  () => rateLimiter.prune(),
  config.AGENT_RATE_LIMIT_WINDOW_MS,
).unref();

// P13 da auditoria end-to-end: a resposta em texto (montada pelos
// formatters a partir do resultado das tools) não tinha nenhum teto de
// tamanho antes de virar JSON de saída — a maioria das tools já limita
// quantidade de tickets via `limite`, mas o detalhe de 1 ticket (comentários
// sem limite nenhum) ou um resumo com muitas categorias podiam gerar uma
// resposta grande o bastante pra pesar no cliente sem nenhum aviso. Corta
// com uma nota explícita em vez de deixar crescer sem limite.
const MAX_RESPOSTA_LENGTH = 50000;

function sendJson(response, statusCode, data) {
  const payload =
    typeof data?.resposta === "string" && data.resposta.length > MAX_RESPOSTA_LENGTH
      ? {
          ...data,
          resposta: `${data.resposta.slice(0, MAX_RESPOSTA_LENGTH)}\n\n[resposta truncada: excedeu o tamanho máximo de ${MAX_RESPOSTA_LENGTH} caracteres]`,
        }
      : data;

  const body = JSON.stringify(payload);

  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  let totalBytes = 0;
  const maxBytes = 16 * 1024;

  for await (const chunk of request) {
    totalBytes += chunk.length;

    if (totalBytes > maxBytes) {
      const error = new Error("Corpo da requisição muito grande.");
      error.statusCode = 413;
      throw error;
    }

    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");

  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("JSON inválido.");
    error.statusCode = 400;
    throw error;
  }
}

function audit(data) {
  console.log(
    JSON.stringify({
      tipo: "auditoria",
      horario: new Date().toISOString(),
      ...data,
    }),
  );
}

const server = http.createServer(async (request, response) => {
  const startedAt = Date.now();
  const requestId = randomUUID();
  if (request.method === "GET") {
  try {
    const served = await serveStaticFile({
      requestUrl: request.url,
      response,
      webDir,
    });

    if (served) {
      return;
    }
  } catch {
    sendJson(response, 500, {
      erro: "arquivo_estatico_indisponivel",
      mensagem: "Não foi possível carregar a interface.",
    });
    return;
  }
}

  if (request.method === "GET" && request.url === "/health") {
    try {
      const llmStatus = await llm.check();

      sendJson(response, 200, {
        status: "ok",
        servico: "agente-consulta-os",
        llm: {
          modelo: config.ANTHROPIC_MODEL,
          conectado: llmStatus.ok === true,
        },
        mcp: {
          conectado: true,
          quantidadeTools: mcp.tools.length,
          tools: mcp.tools.map((tool) => tool.name),
        },
        quantidadeToolsModelo: llmTools.length,
        horario: new Date().toISOString(),
      });
    } catch {
      sendJson(response, 503, {
        status: "degradado",
        servico: "agente-consulta-os",
        llm: {
          conectado: false,
        },
        mcp: {
          conectado: true,
        },
        horario: new Date().toISOString(),
      });
    }

    return;
  }

  if (
    request.method === "POST"
    && request.url === "/api/ia/consultar-os"
  ) {
    // Por IP, não por X-User-Id — esse header não é autenticado (qualquer
    // valor passa), então limitar por ele seria trivialmente contornável só
    // trocando o valor a cada requisição.
    const remoteIp = request.socket.remoteAddress ?? "desconhecido";
    const limite = rateLimiter.check(remoteIp);

    if (!limite.allowed) {
      audit({
        requestId,
        usuario: null,
        resultado: "recusado",
        motivo: "limite_de_requisicoes",
        duracaoMs: Date.now() - startedAt,
      });

      response.setHeader("Retry-After", Math.ceil(limite.retryAfterMs / 1000));
      sendJson(response, 429, {
        requestId,
        erro: "limite_de_requisicoes",
        mensagem: "Muitas requisições em pouco tempo. Tente novamente em instantes.",
      });
      return;
    }

    const rawUserId = Array.isArray(request.headers["x-user-id"])
      ? request.headers["x-user-id"][0]
      : request.headers["x-user-id"];

    const userResult = userIdSchema.safeParse(rawUserId);

    if (!userResult.success) {
      sendJson(response, 400, {
        requestId,
        erro: "usuario_invalido",
        mensagem: "O cabeçalho X-User-Id é obrigatório.",
      });
      return;
    }

    try {
      const body = await readJson(request);
      const bodyResult = requestSchema.safeParse(body);

      if (!bodyResult.success) {
        sendJson(response, 400, {
          requestId,
          erro: "requisicao_invalida",
          mensagem:
            "A pergunta é obrigatória e deve ter até 2000 caracteres.",
        });
        return;
      }

      // Mescla a pergunta anterior (devolvida por este mesmo servidor na
      // resposta de antes) só quando a frase nova começa com um marcador de
      // continuação de alta confiança — ver agent/continuation.js. A mescla
      // acontece ANTES de qualquer outra checagem, pra um pedido de escrita
      // não escapar do guard só por vir partido em 2 turnos (checa os dois
      // textos, cru e mesclado, abaixo).
      const temPerguntaAnterior =
        typeof bodyResult.data.perguntaAnterior === "string"
        && bodyResult.data.perguntaAnterior.length > 0;

      const continuacaoDetectada =
        temPerguntaAnterior && detectsContinuation(bodyResult.data.pergunta);

      const perguntaEfetiva = continuacaoDetectada
        ? mergeContinuation(bodyResult.data.perguntaAnterior, bodyResult.data.pergunta)
        : bodyResult.data.pergunta;

      if (
        isWriteRequest(bodyResult.data.pergunta)
        || (continuacaoDetectada && isWriteRequest(perguntaEfetiva))
      ) {
        const duracaoMs = Date.now() - startedAt;

        audit({
          requestId,
          usuario: userResult.data,
          resultado: "recusado",
          motivo: "operacao_de_escrita",
          continuacaoDetectada,
          toolsUtilizadas: [],
          quantidadeChamadas: 0,
          duracaoMs,
        });

        sendJson(response, 200, {
          requestId,
          resposta:
            "Este sistema permite somente consultas de tickets. Operações de criação, alteração, mudança de status ou comentário não são permitidas.",
          fontes: [],
          toolsUtilizadas: [],
          quantidadeChamadas: 0,
          duracaoMs,
        });
        return;
      }

      if (
        isExternalActionRequest(bodyResult.data.pergunta)
        || (continuacaoDetectada && isExternalActionRequest(perguntaEfetiva))
      ) {
        const duracaoMs = Date.now() - startedAt;

        audit({
          requestId,
          usuario: userResult.data,
          resultado: "recusado",
          motivo: "acao_externa_nao_suportada",
          continuacaoDetectada,
          toolsUtilizadas: [],
          quantidadeChamadas: 0,
          duracaoMs,
        });

        sendJson(response, 200, {
          requestId,
          resposta:
            "Este sistema só faz consultas sobre tickets. Não envio e-mails, mensagens ou notificações, nem realizo nenhuma ação fora da consulta.",
          fontes: [],
          toolsUtilizadas: [],
          quantidadeChamadas: 0,
          duracaoMs,
        });
        return;
      }

      if (
        isCapabilityQuestion(bodyResult.data.pergunta)
        || (continuacaoDetectada && isCapabilityQuestion(perguntaEfetiva))
      ) {
        const duracaoMs = Date.now() - startedAt;

        audit({
          requestId,
          usuario: userResult.data,
          resultado: "recusado",
          motivo: "pergunta_de_capacidade",
          continuacaoDetectada,
          toolsUtilizadas: [],
          quantidadeChamadas: 0,
          duracaoMs,
        });

        sendJson(response, 200, {
          requestId,
          resposta:
            "Não — este sistema permite somente consultas de tickets. Não crio, altero, excluo nem fecho tickets, e não envio e-mails, mensagens ou notificações. Posso ajudar com consultas sobre os tickets existentes (status, prioridade, área, departamento, operador, cliente ou período).",
          fontes: [],
          toolsUtilizadas: [],
          quantidadeChamadas: 0,
          duracaoMs,
        });
        return;
      }

      // Pré-filtro determinístico e sem custo (sem chamada à API paga): a
      // rota por regex detectou uma negação que nenhuma tool sustenta
      // (ex.: "tickets diferentes de cancelados") ou um termo ambíguo sem
      // contexto suficiente (ex.: "parado" sozinho) — responde pedindo
      // esclarecimento direto, sem chamar o Claude.
      const route = routeTicketQuestion(perguntaEfetiva);

      if (route?.clarification) {
        const duracaoMs = Date.now() - startedAt;

        audit({
          requestId,
          usuario: userResult.data,
          resultado: "esclarecimento",
          motivo: route.intent,
          toolsUtilizadas: [],
          quantidadeChamadas: 0,
          continuacaoDetectada,
          duracaoMs,
        });

        sendJson(response, 200, {
          requestId,
          resposta: route.clarification,
          fontes: [],
          dadosConsultados: [],
          toolsUtilizadas: [],
          quantidadeChamadas: 0,
          esclarecimento: true,
          perguntaEfetiva,
          duracaoMs,
        });
        return;
      }

      if (activeAgentRequests >= config.AGENT_MAX_CONCURRENT_REQUESTS) {
        const duracaoMs = Date.now() - startedAt;

        audit({
          requestId,
          usuario: userResult.data,
          resultado: "recusado",
          motivo: "limite_concorrencia",
          duracaoMs,
        });

        sendJson(response, 429, {
          requestId,
          erro: "agente_ocupado",
          mensagem:
            "O agente está processando outra consulta. Tente novamente em instantes.",
        });
        return;
      }

      const disconnectController = new AbortController();

      response.on("close", () => {
        if (!response.writableEnded) {
          disconnectController.abort();
        }
      });

      const signal = AbortSignal.any([
        AbortSignal.timeout(config.AGENT_REQUEST_TIMEOUT_MS),
        disconnectController.signal,
      ]);

      let llmDecision;

      activeAgentRequests += 1;

      try {
        llmDecision = await interpretQuestion({
          llm,
          llmTools,
          pergunta: perguntaEfetiva,
          signal,
        });
      } finally {
        activeAgentRequests -= 1;
      }

      if (llmDecision.resposta !== undefined) {
        const duracaoMs = Date.now() - startedAt;

        audit({
          requestId,
          usuario: userResult.data,
          resultado: "esclarecimento",
          motivo: "llm_sem_tool",
          toolsUtilizadas: [],
          quantidadeChamadas: 0,
          continuacaoDetectada,
          duracaoMs,
        });

        sendJson(response, 200, {
          requestId,
          resposta: llmDecision.resposta,
          fontes: [],
          dadosConsultados: [],
          toolsUtilizadas: [],
          quantidadeChamadas: 0,
          esclarecimento: true,
          perguntaEfetiva,
          duracaoMs,
        });
        return;
      }

      // O Claude decidiu fazer 2+ chamadas da mesma tool na mesma resposta
      // (comparação entre itens nomeados, ver system prompt em
      // agent/llm-router.js) — runCompare/formatComparison já são
      // genéricos pra N itens.
      if (llmDecision.compare !== undefined) {
        let compareResult;

        activeAgentRequests += 1;

        try {
          compareResult = await runCompare({
            mcp,
            comparisons: llmDecision.compare,
          });
        } finally {
          activeAgentRequests -= 1;
        }

        const duracaoMs = Date.now() - startedAt;

        audit({
          requestId,
          usuario: userResult.data,
          resultado: "sucesso",
          toolsUtilizadas: compareResult.toolsUtilizadas,
          quantidadeChamadas: compareResult.quantidadeChamadas,
          continuacaoDetectada,
          duracaoMs,
        });

        sendJson(response, 200, {
          requestId,
          resposta: compareResult.resposta,
          fontes: compareResult.fontes,
          dadosConsultados: compareResult.dadosConsultados,
          toolsUtilizadas: compareResult.toolsUtilizadas,
          quantidadeChamadas: compareResult.quantidadeChamadas,
          perguntaEfetiva,
          duracaoMs,
        });
        return;
      }

      let decidedResult;

      activeAgentRequests += 1;

      try {
        decidedResult = await runDecidedTool({
          mcp,
          llm,
          name: llmDecision.toolName,
          args: llmDecision.args,
          synthesize: llmDecision.synthesize ?? null,
          signal,
        });
      } finally {
        activeAgentRequests -= 1;
      }

      const duracaoMs = Date.now() - startedAt;

      audit({
        requestId,
        usuario: userResult.data,
        resultado: "sucesso",
        toolsUtilizadas: decidedResult.toolsUtilizadas,
        quantidadeChamadas: decidedResult.quantidadeChamadas,
        continuacaoDetectada,
        duracaoMs,
      });

      sendJson(response, 200, {
        requestId,
        resposta: decidedResult.resposta,
        fontes: decidedResult.fontes,
        dadosConsultados: decidedResult.dadosConsultados,
        toolsUtilizadas: decidedResult.toolsUtilizadas,
        quantidadeChamadas: decidedResult.quantidadeChamadas,
        perguntaEfetiva,
        duracaoMs,
      });
    } catch (error) {
      let statusCode = 500;
      let errorCode = "erro_interno";
      let message = "Não foi possível processar a consulta.";

      if (error?.statusCode === 400) {
        statusCode = 400;
        errorCode = "requisicao_invalida";
        message = "O corpo da requisição deve conter JSON válido.";
      } else if (error?.statusCode === 413) {
        statusCode = 413;
        errorCode = "requisicao_muito_grande";
        message = "O corpo da requisição excede o limite permitido.";
      } else if (error instanceof AgentError) {
        if (error.code === "tempo_excedido") {
          statusCode = 504;
          errorCode = "tempo_excedido";
          message = "A consulta excedeu o tempo máximo.";
        } else {
          statusCode = 502;
          errorCode = error.code;
          message =
            "Não foi possível concluir a consulta com o agente.";
        }
      }

      audit({
        requestId,
        usuario: userResult.data,
        resultado: "erro",
        codigoErro: errorCode,
        duracaoMs: Date.now() - startedAt,
      });

      sendJson(response, statusCode, {
        requestId,
        erro: errorCode,
        mensagem: message,
      });
    }

    return;
  }

  if (request.url === "/api/ia/consultar-os") {
    sendJson(response, 405, {
      erro: "metodo_nao_permitido",
      mensagem: "Utilize o método POST.",
    });
    return;
  }

  sendJson(response, 404, {
    erro: "rota_nao_encontrada",
    mensagem: "A rota solicitada não existe.",
  });
});

server.requestTimeout = config.AGENT_REQUEST_TIMEOUT_MS;
server.headersTimeout = Math.min(
  60000,
  config.AGENT_REQUEST_TIMEOUT_MS,
);

server.on("clientError", (_error, socket) => {
  socket.end(
    "HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n",
  );
});

server.on("error", async (error) => {
  console.error(
    `Não foi possível iniciar o backend. Código: ${
      error?.code ?? "erro_desconhecido"
    }`,
  );

  try {
    await mcp.close();
  } catch {
    console.error("Não foi possível encerrar o cliente MCP.");
  }

  process.exit(1);
});

server.listen(config.AGENT_PORT, config.AGENT_HOST, () => {
  console.log(
    `Backend agente iniciado em http://${config.AGENT_HOST}:${config.AGENT_PORT}`,
  );
});

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  server.close(async () => {
    try {
      await mcp.close();
    } catch {
      console.error(
        "Não foi possível encerrar o cliente MCP corretamente.",
      );
    }

    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
