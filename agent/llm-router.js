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
    "Se a pergunta pedir uma COMPARAÇÃO entre 2 (ou mais) itens nomeados — ex.: \"compare o operador X com o Y\", \"qual área tem mais tickets, X ou Y\", \"detalhe os tickets 100 e 200\" — chame a MESMA ferramenta uma vez para cada item, na mesma resposta, cada chamada com o nome de só UM item isolado no argumento (nunca inclua palavras como \"a carga de trabalho do\" dentro do nome — só o nome da pessoa/área/departamento em si).",
    "Para comparar OPERADOR use analisar_carga_operador (argumento operador); para CLIENTE use analisar_atividade_cliente (argumento cliente); para ÁREA ou DEPARTAMENTO use listar_tickets com limite:1 (argumento area OU departamento) — NUNCA use uma ferramenta de resumo/agrupamento (ex.: resumo_tickets_por_area) para comparar, porque ela agrupa por aquela dimensão em vez de filtrar por um valor específico dela, e vai ignorar o nome que você passar.",
    "O mesmo vale fora de uma comparação: se a pergunta for sobre UM operador ou cliente nomeado específico (carga de trabalho dele, quantos tickets tem, quantos estão em aberto/fechados, ticket mais antigo em aberto dele) — não um agrupamento geral tipo \"quais operadores têm mais tickets\" — use analisar_carga_operador (operador) ou analisar_atividade_cliente (cliente) em vez de resumo_tickets_por_operador/resumo_tickets_por_cliente; essas ferramentas de resumo são feitas pra agrupar POR essa dimensão, e aplicar o nome como filtro nelas tende a devolver uma resposta pior ou vazia mesmo quando a pessoa tem tickets.",
    "Se a pergunta for ambígua (puder significar duas coisas diferentes de um jeito que mudaria qual ferramenta ou argumento usar) ou claramente não for sobre tickets, não chame nenhuma ferramenta — responda em texto, em português, pedindo esclarecimento ou explicando objetivamente que este sistema só responde consultas sobre tickets.",
    "Nunca inclua na sua resposta em texto nenhum dado concreto de ticket (número, status, nome de operador/cliente etc.) que não tenha vindo do resultado de uma ferramenta — se ainda não chamou nenhuma, você não tem esse dado.",
    "Responda sempre em português, de forma objetiva.",
  ].join(" ");
}

// {toolName, args, synthesize?} quando o modelo escolheu 1 ferramenta,
// {compare: [{toolName,args}, ...]} quando pediu a MESMA ferramenta 2+
// vezes na mesma resposta (comparação entre itens nomeados — reaproveita
// runCompare/formatComparison, já genéricos pra N itens, ver agent/
// agent-loop.js), ou {resposta} (texto livre — esclarecimento ou resposta
// fora do domínio) quando não chamou nenhuma.
export async function interpretQuestion({ llm, llmTools, pergunta, signal }) {
  const response = await llm.chat({
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: pergunta },
    ],
    tools: llmTools,
    signal,
  });

  const toolCalls = response.message.tool_calls ?? [];

  if (toolCalls.length === 0) {
    const resposta = response.message.content.trim();

    if (!resposta) {
      throw new AgentError(
        "resposta_modelo_vazia",
        "O modelo não produziu uma resposta final.",
      );
    }

    return { resposta };
  }

  if (toolCalls.length > 1) {
    return {
      compare: toolCalls.map((toolCall) => ({
        toolName: toolCall.function.name,
        args: toolCall.function.arguments,
      })),
    };
  }

  const decision = {
    toolName: toolCalls[0].function.name,
    args: toolCalls[0].function.arguments,
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
