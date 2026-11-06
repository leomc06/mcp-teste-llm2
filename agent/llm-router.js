import { AgentError } from "./agent-error.js";
import { isResumoExecutivoIntent, isResumoTicketIntent } from "./tickets-routing.js";

// Fase 3 do plano de migração: aqui é o LLM de nuvem (Claude, via
// agent/llm-client.js) quem decide a tool+argumentos, não mais o roteador
// regex de agent/tickets-routing.js — este módulo só monta o pedido e
// normaliza a resposta. As guardas de escrita (agent/write-policy.js)
// continuam rodando ANTES disso, inalteradas, no chamador (agent/server.js).
function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

// Deliberadamente não cita a data de hoje pelo nome do mês/dia da semana —
// só o formato AAAA-MM-DD, igual ao que os parâmetros de data das tools
// exigem, pra não dar ao modelo um formato pra "copiar errado".
export function buildSystemPrompt({ today = todayIsoDate() } = {}) {
  return [
    `Hoje é ${today}.`,
    "Você é o interpretador de perguntas de um sistema interno de consulta a tickets (chamados) de suporte técnico, read-only.",
    "Nunca cria, altera, exclui ou comenta em tickets, nem envia e-mail, mensagem ou notificação — isso já é bloqueado antes da pergunta chegar até você; se o usuário insistir em pedir uma dessas ações, responda em texto (sem chamar nenhuma ferramenta) explicando essa limitação.",
    "Para responder uma consulta, escolha exatamente UMA das ferramentas disponibilizadas e preencha os argumentos a partir do texto da pergunta.",
    "Nunca invente nome de pessoa, área, departamento, cliente ou número de ticket que não esteja na pergunta — se o nome citado não existir no sistema, a própria ferramenta avisa isso depois, não é algo que você precisa adivinhar.",
    "Resolva datas relativas (ex.: \"mês passado\", \"essa semana\", \"última quinzena\", \"ano passado\") sozinho a partir da data de hoje informada acima, sempre no formato AAAA-MM-DD exigido pelos parâmetros de data.",
    "Se a pergunta for ambígua (puder significar duas coisas diferentes de um jeito que mudaria qual ferramenta ou argumento usar) ou claramente não for sobre tickets, não chame nenhuma ferramenta — responda em texto, em português, pedindo esclarecimento ou explicando objetivamente que este sistema só responde consultas sobre tickets.",
    "Nunca inclua na sua resposta em texto nenhum dado concreto de ticket (número, status, nome de operador/cliente etc.) que não tenha vindo do resultado de uma ferramenta — se ainda não chamou nenhuma, você não tem esse dado.",
    "Responda sempre em português, de forma objetiva.",
  ].join(" ");
}

// {toolName, args, synthesize?} quando o modelo escolheu uma ferramenta,
// ou {resposta} (texto livre — esclarecimento ou resposta fora do domínio)
// quando não chamou nenhuma.
export async function interpretQuestion({ llm, llmTools, pergunta, signal }) {
  const response = await llm.chat({
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: pergunta },
    ],
    tools: llmTools,
    signal,
  });

  const toolCall = response.message.tool_calls?.[0];

  if (!toolCall) {
    const resposta = response.message.content.trim();

    if (!resposta) {
      throw new AgentError(
        "resposta_modelo_vazia",
        "O modelo não produziu uma resposta final.",
      );
    }

    return { resposta };
  }

  const decision = {
    toolName: toolCall.function.name,
    args: toolCall.function.arguments,
  };

  // Mesma decisão de síntese que o roteador regex já tomava (ver
  // agent/tickets-routing.js) — continua puramente textual/determinística
  // mesmo com o LLM decidindo a tool, porque só depende de reconhecer o
  // pedido explícito de "resumo", não de entender a pergunta como um todo.
  if (decision.toolName === "resumo_operacional_tickets" && isResumoExecutivoIntent(pergunta)) {
    decision.synthesize = "resumo_executivo";
  } else if (decision.toolName === "buscar_ticket_por_numero" && isResumoTicketIntent(pergunta)) {
    decision.synthesize = "resumo_ticket";
  }

  return decision;
}
