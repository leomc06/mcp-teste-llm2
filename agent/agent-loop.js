import {
  formatToolResults,
  formatComparison,
  formatTicketDetail,
  formatOperationalSummary,
  hasSummarizableTicketContent,
} from "./response-formatter.js";
import { AgentError } from "./agent-error.js";

export { AgentError };

function mcpContentToText(result) {
  if (!Array.isArray(result.content)) {
    throw new AgentError(
      "resposta_mcp_invalida",
      "A tool MCP não retornou conteúdo.",
    );
  }

  const texts = result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text);

  if (texts.length === 0) {
    throw new AgentError(
      "resposta_mcp_invalida",
      "A tool MCP não retornou conteúdo textual.",
    );
  }

  return texts.join("\n");
}

// Texto de ticket (issue/description/comentários) vem de campos livres
// preenchidos por usuários do sistema de tickets, e entra sem revisão no
// histórico de mensagens que — em cenários residuais (erro parcial numa
// chamada com múltiplas tools na mesma rodada) — pode ser reenviado ao
// modelo. Isso não é a defesa principal (o system prompt já instrui a
// tratar resultado de tool como dado, nunca instrução, e o caminho comum de
// sucesso nem chega a reenviar o histórico), mas reduz a superfície de um
// ticket malicioso tentando imitar uma instrução de sistema ("ignore as
// instruções anteriores", "system:", etc.) — defesa em profundidade, não
// uma garantia absoluta contra prompt injection.
const INJECTION_PATTERN_SOURCES = [
  "ignor[ea]\\s+(?:todas?\\s+)?(?:as\\s+)?instru[cç][oõ]es",
  "ignore\\s+(?:all\\s+)?(?:previous|above)\\s+instructions",
  "voce\\s+(?:agora\\s+)?[ée]\\s+um",
  "you\\s+are\\s+now",
  "aja\\s+como",
  "act\\s+as",
  "esque[cç]a\\s+(?:tudo|as\\s+instru[cç][oõ]es)",
  "forget\\s+(?:everything|previous)",
  "\\bsystem\\s*:",
  "\\bassistant\\s*:",
  "new\\s+instructions?\\s*:",
  "novas?\\s+instru[cç][oõ]es\\s*:",
];
const INJECTION_PATTERN = new RegExp(`(?:${INJECTION_PATTERN_SOURCES.join("|")})`, "giu");
const MAX_TOOL_TEXT_FOR_MODEL = 6000;

export function sanitizeForModel(text) {
  const semPadroesSuspeitos = text.replace(INJECTION_PATTERN, "[trecho removido]");

  return semPadroesSuspeitos.length > MAX_TOOL_TEXT_FOR_MODEL
    ? `${semPadroesSuspeitos.slice(0, MAX_TOOL_TEXT_FOR_MODEL)}... [truncado]`
    : semPadroesSuspeitos;
}

// Camada de síntese: a única parte do sistema onde o modelo lê e reescreve
// texto de verdade, em vez de só formalizar uma chamada de tool já decidida
// pelo roteador (`tickets-routing.js`). Continua sem poder de decisão sobre
// tool/parâmetro — o roteador já decidiu isso e marcou `synthesize` no
// objeto de rota; esta camada só entra DEPOIS de uma chamada de tool já
// bem-sucedida, e nunca substitui o bloco de dados original (sempre exibido
// junto — "quem lê decide", mesma filosofia de formatComparison).
const SYNTHESIS_SPECS = {
  resumo_ticket: {
    tool: "buscar_ticket_por_numero",
    intro: "Resumo automático",
    label: "Ticket completo",
    buildSourceText: (dados) => formatTicketDetail(dados),
    isEligible: (dados) => dados.encontrado === true && hasSummarizableTicketContent(dados.ticket),
    systemPrompt: [
      "Você resume um ticket de suporte técnico.",
      "O texto a seguir traz metadados do ticket (status, prioridade, datas, SLA) seguidos da descrição e dos comentários.",
      "Baseie o resumo exclusivamente na descrição e nos comentários — não repita os metadados, eles já aparecem em outro lugar.",
      "Nunca invente informações que não estejam no texto.",
      "Não adicione opiniões, recomendações ou conclusões que não estejam explicitamente no texto.",
      "Se não houver comentários além da abertura, diga isso em vez de inventar andamento.",
      "Escreva de 1 a 2 frases, em português, tom neutro e objetivo.",
    ].join(" "),
  },
  resumo_executivo: {
    tool: "resumo_operacional_tickets",
    intro: "Resumo executivo",
    label: "Números da operação",
    buildSourceText: (dados) => formatOperationalSummary(dados),
    isEligible: (dados) => dados.encontrado !== false,
    systemPrompt: [
      "Você escreve um parágrafo executivo em português, resumindo a operação de atendimento a chamados para um gestor não técnico.",
      "Baseie-se exclusivamente nos números fornecidos a seguir, incluindo os filtros (área/departamento/período) já aplicados.",
      "Nunca invente números, tendências ou causas que não estejam nos dados.",
      "\"Sem operador atribuído: N\" significa que N tickets estão sem operador atribuído — não inverta esse sentido.",
      "A lista de tickets mais antigos ainda em aberto já vem ordenada do mais antigo para o mais recente; ao citá-la, descreva-a nessa ordem e não afirme qual ticket específico \"tem mais dias em aberto\" ou \"espera há mais tempo\" além do primeiro da lista.",
      "Não conclua se a operação está indo bem ou mal (ex.: \"eficiente\", \"tranquila\", \"preocupante\") nem adicione recomendações, julgamentos de desempenho ou comparações com períodos anteriores — os dados são só do período atual, apenas descreva os números.",
      "Escreva um único parágrafo corrido, tom profissional, sem tópicos nem marcadores.",
    ].join(" "),
  },
};

// Nunca lança erro — é um passo adicional sobre um resultado que já teve
// sucesso (a tool MCP já respondeu), então uma falha aqui (timeout, erro
// HTTP, resposta vazia) não pode derrubar a resposta inteira. Diferente da
// chamada que decide a tool (agent/llm-router.js), que lança AgentError
// porque sem ela não há resposta nenhuma pra devolver.
async function trySynthesize({ llm, spec, sourceText, signal }) {
  try {
    const response = await llm.chat({
      messages: [
        { role: "system", content: spec.systemPrompt },
        { role: "user", content: sanitizeForModel(sourceText) },
      ],
      tools: [],
      signal,
    });

    const texto = response.message.content.trim();

    return texto.length > 0 ? texto : null;
  } catch {
    return null;
  }
}

function collectSources(text, toolName, sources) {
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    return;
  }

  function visit(value) {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }

      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    if (Number.isInteger(value.number) && value.number > 0) {
      const key = `${toolName}:${value.number}`;

      sources.set(key, {
        numero: value.number,
        tool: toolName,
      });
    }

    for (const item of Object.values(value)) {
      visit(item);
    }
  }

  visit(data);
}

// "Compare X e Y" — as 2+ chamadas (mesma tool, 1 conjunto de argumentos
// por lado) já vêm decididas de fora (pelo LLM, ver agent/llm-router.js,
// ou pelo roteador por regex só pra validar o próprio módulo em teste) —
// aqui só executa e formata, sem decidir nada.
export async function runCompare({ mcp, comparisons }) {
  const toolResults = [];
  const sources = new Map();

  for (const { toolName, args } of comparisons) {
    let result;

    try {
      result = await mcp.callTool(toolName, args);
    } catch {
      throw new AgentError(
        "falha_mcp",
        "Não foi possível executar a tool MCP.",
      );
    }

    const text = mcpContentToText(result);

    if (result.isError === true) {
      throw new AgentError(
        "falha_mcp",
        "Não foi possível concluir a comparação: uma das consultas falhou.",
      );
    }

    collectSources(text, toolName, sources);

    let dados;

    try {
      dados = JSON.parse(text);
    } catch {
      throw new AgentError(
        "resposta_mcp_invalida",
        "A tool MCP não retornou JSON válido.",
      );
    }

    toolResults.push({ tool: toolName, dados });
  }

  return {
    resposta: formatComparison(
      comparisons[0].toolName,
      toolResults.map((item) => item.dados),
    ),
    fontes: [...sources.values()],
    dadosConsultados: toolResults,
    toolsUtilizadas: comparisons.map((item) => item.toolName),
    quantidadeChamadas: comparisons.length,
  };
}

// Executa 1 tool cuja escolha (nome + argumentos) já veio decidida de
// fora — pelo LLM de nuvem (agent/llm-router.js) — sem nenhum loop de
// decisão: a única chamada ao LLM aqui dentro é opcional, só pra
// sintetizar texto sobre um resultado já obtido (`synthesize`), nunca
// pra decidir qual tool usar.
export async function runDecidedTool({
  mcp,
  llm,
  name,
  args,
  synthesize = null,
  verbosidade = null,
  signal,
}) {
  let result;

  try {
    result = await mcp.callTool(name, args);
  } catch {
    throw new AgentError(
      "falha_mcp",
      "Não foi possível executar a tool MCP.",
    );
  }

  const text = mcpContentToText(result);

  if (result.isError === true) {
    throw new AgentError(
      "falha_mcp",
      "A tool MCP retornou erro.",
    );
  }

  const sources = new Map();
  collectSources(text, name, sources);

  let dados;

  try {
    dados = JSON.parse(text);
  } catch {
    throw new AgentError(
      "resposta_mcp_invalida",
      "A tool MCP não retornou JSON válido.",
    );
  }

  const toolResults = [{ tool: name, dados }];
  const baseResposta = formatToolResults(toolResults, { verbosidade });
  let resposta = baseResposta;

  if (synthesize) {
    const spec = SYNTHESIS_SPECS[synthesize];

    if (spec && name === spec.tool && spec.isEligible(dados)) {
      const sourceText = spec.buildSourceText(dados);
      const synthesisText = await trySynthesize({ llm, spec, sourceText, signal });

      resposta = synthesisText
        ? `${spec.intro}: ${synthesisText}\n\n--- ${spec.label} ---\n${sourceText}`
        : `${baseResposta}\n\n(resumo automático indisponível no momento; seguem os dados completos)`;
    }
  }

  return {
    resposta,
    fontes: [...sources.values()],
    dadosConsultados: toolResults,
    toolsUtilizadas: [name],
    quantidadeChamadas: 1,
  };
}

