// Fase 4 do plano de migração pro LLM de nuvem: modo sombra — compara a
// decisão do roteador por regex (já em produção) com a decisão que o
// Claude teria tomado pra MESMA pergunta, sem agir sobre a decisão do LLM
// (quem continua respondendo o usuário é sempre o regex nesse modo). Esta
// camada só descreve/compara as 2 decisões de forma pura, sem rede — quem
// dispara a chamada real ao LLM e loga o resultado é agent/server.js.
//
// Compara no nível de "qual tool" (e, pra compare, "quais tools"), não no
// nível de argumento exato — já é o sinal mais importante pra decidir se
// vale confiar no corte (ver Fase 4 do plano): divergência de TOOL é um
// problema sério; divergência de capitalização/acentuação num nome
// capturado, por exemplo, não é (o catálogo real resolve isso dos dois
// lados, ver Fase 1).

// {tipo: "tool", tool} | {tipo: "compare", tools} | {tipo: "esclarecimento", intent}
export function describeRegexDecision(route) {
  if (!route) {
    return { tipo: "fallback_sem_rota" };
  }

  if (route.clarification) {
    return { tipo: "esclarecimento", intent: route.intent };
  }

  if (route.compare) {
    return { tipo: "compare", tools: route.compare.map((item) => item.toolName) };
  }

  if (route.toolNames.length === 1) {
    return { tipo: "tool", tool: route.toolNames[0] };
  }

  return { tipo: "indefinido" };
}

// {tipo: "tool", tool} | {tipo: "compare", tools} | {tipo: "resposta_livre"}
export function describeLlmDecision(decision) {
  if (decision.resposta !== undefined) {
    return { tipo: "resposta_livre" };
  }

  if (decision.compare !== undefined) {
    return { tipo: "compare", tools: decision.compare.map((item) => item.toolName) };
  }

  return { tipo: "tool", tool: decision.toolName };
}

export function decisionsConcordam(regexDesc, llmDesc) {
  // Regex pediu esclarecimento E o LLM respondeu em texto livre (sem
  // chamar tool) — são o MESMO comportamento de fundo ("não decidi uma
  // tool"), só com rótulos diferentes porque vêm de mecanismos diferentes.
  if (regexDesc.tipo === "esclarecimento" && llmDesc.tipo === "resposta_livre") {
    return true;
  }

  if (regexDesc.tipo !== llmDesc.tipo) {
    return false;
  }

  if (regexDesc.tipo === "tool") {
    return regexDesc.tool === llmDesc.tool;
  }

  if (regexDesc.tipo === "compare") {
    return (
      regexDesc.tools.length === llmDesc.tools.length
      && regexDesc.tools.every((tool, index) => tool === llmDesc.tools[index])
    );
  }

  return true;
}
