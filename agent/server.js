import http from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createMcpClient } from "./mcp-client.js";
import { createOllamaClient } from "./ollama-client.js";
import { AgentError, runAgent } from "./agent-loop.js";
import {
  selectToolDecision,
} from "./tool-selector.js";
import {
  buildToolArguments,
} from "./routing-utils.js";
import { isWriteRequest } from "./write-policy.js";
import { serveStaticFile } from "./static-files.js";

const configSchema = z.object({
  AGENT_HOST: z.string().min(1),
  AGENT_PORT: z.coerce.number().int().min(1).max(65535),
  AGENT_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(300000),
  AGENT_MAX_TOOL_CALLS: z.coerce.number().int().min(1).max(10),
  AGENT_MAX_CONCURRENT_REQUESTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(10),
  OLLAMA_BASE_URL: z.string().url(),
  OLLAMA_MODEL: z.string().min(1).max(100),
  OLLAMA_NUM_THREAD: z.coerce.number().int().min(1).max(4),
  OLLAMA_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(300000),
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

const ollama = createOllamaClient({
  baseUrl: config.OLLAMA_BASE_URL,
  model: config.OLLAMA_MODEL,
  timeoutMs: config.OLLAMA_TIMEOUT_MS,
  numThread: config.OLLAMA_NUM_THREAD,
});

const ollamaTools = ollama.formatTools(mcp.tools);

const requestSchema = z
  .object({
    pergunta: z.string().trim().min(1).max(2000),
  })
  .strict();

const userIdSchema = z.string().trim().min(1).max(100);
let activeAgentRequests = 0;

function sendJson(response, statusCode, data) {
  const body = JSON.stringify(data);

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
      const ollamaStatus = await ollama.check();

      sendJson(response, 200, {
        status: "ok",
        servico: "agente-consulta-os",
        modelo: config.OLLAMA_MODEL,
        ollama: {
          conectado: true,
          versao: ollamaStatus.version,
        },
        mcp: {
          conectado: true,
          quantidadeTools: mcp.tools.length,
          tools: mcp.tools.map((tool) => tool.name),
        },
        quantidadeToolsModelo: ollamaTools.length,
        horario: new Date().toISOString(),
      });
    } catch {
      sendJson(response, 503, {
        status: "degradado",
        servico: "agente-consulta-os",
        ollama: {
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

      if (isWriteRequest(bodyResult.data.pergunta)) {
        const duracaoMs = Date.now() - startedAt;

        audit({
          requestId,
          usuario: userResult.data,
          resultado: "recusado",
          motivo: "operacao_de_escrita",
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

      const toolDecision = selectToolDecision(
        bodyResult.data.pergunta,
        ollamaTools,
      );

      if (toolDecision.route?.fallback === true) {
        const duracaoMs = Date.now() - startedAt;

        audit({
          requestId,
          usuario: userResult.data,
          resultado: "esclarecimento",
          motivo: "intencao_os_ambigua",
          quantidadeToolsDisponibilizadas: 0,
          toolsUtilizadas: [],
          quantidadeChamadas: 0,
          duracaoMs,
        });

        sendJson(response, 200, {
          requestId,
          resposta: toolDecision.route.clarification,
          fontes: [],
          dadosConsultados: [],
          toolsUtilizadas: [],
          quantidadeChamadas: 0,
          esclarecimento: true,
          duracaoMs,
        });

        return;
      }

      let routeToolArguments = null;

      if (
        toolDecision.route !== null
        && toolDecision.route.toolNames.length === 1
      ) {
        const routeToolName =
          toolDecision.route.toolNames[0];

        const buildResult = buildToolArguments(
          routeToolName,
          toolDecision.route.entities,
          toolDecision.tools,
        );

        const toolUnavailable =
          buildResult.errors.some(
            ({ code }) =>
              code === "tool_not_available",
          );

        if (toolUnavailable) {
          throw new AgentError(
            "tool_rota_indisponivel",
            "A tool selecionada não está disponível.",
          );
        }

        if (!buildResult.ok) {
          const invalidFields = [
            ...new Set(
              buildResult.errors
                .map(({ field }) => field)
                .filter(Boolean),
            ),
          ];

          const duracaoMs = Date.now() - startedAt;
          const fieldsText = invalidFields.length > 0
            ? invalidFields.join(", ")
            : "filtros";

          audit({
            requestId,
            usuario: userResult.data,
            resultado: "esclarecimento",
            motivo: "filtros_rota_invalidos",
            quantidadeToolsDisponibilizadas: 0,
            toolsUtilizadas: [],
            quantidadeChamadas: 0,
            duracaoMs,
          });

          sendJson(response, 200, {
            requestId,
            resposta:
              `Revise os seguintes filtros: ${fieldsText}.`,
            fontes: [],
            dadosConsultados: [],
            toolsUtilizadas: [],
            quantidadeChamadas: 0,
            esclarecimento: true,
            duracaoMs,
          });

          return;
        }

        routeToolArguments = {
          name: routeToolName,
          args: buildResult.args,
        };
      }

      if (
        activeAgentRequests
        >= config.AGENT_MAX_CONCURRENT_REQUESTS
      ) {
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

      const signal = AbortSignal.timeout(
        config.AGENT_REQUEST_TIMEOUT_MS,
      );

      const selectedOllamaTools =
        toolDecision.tools;

      let agentResult;

      activeAgentRequests += 1;

      try {
        agentResult = await runAgent({
          pergunta: bodyResult.data.pergunta,
          mcp,
          ollama,
          ollamaTools: selectedOllamaTools,
          routeToolArguments,
          maxToolCalls: config.AGENT_MAX_TOOL_CALLS,
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
        quantidadeToolsDisponibilizadas: selectedOllamaTools.length,
        toolsUtilizadas: agentResult.toolsUtilizadas,
        quantidadeChamadas: agentResult.quantidadeChamadas,
        duracaoMs,
      });

      sendJson(response, 200, {
        requestId,
        resposta: agentResult.resposta,
        fontes: agentResult.fontes,
        dadosConsultados: agentResult.dadosConsultados,
        toolsUtilizadas: agentResult.toolsUtilizadas,
        quantidadeChamadas: agentResult.quantidadeChamadas,
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
