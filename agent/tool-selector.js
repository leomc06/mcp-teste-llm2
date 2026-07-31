import {
  normalizeText,
  routeOsQuestion,
} from "./os-routing.js";

function selectClientTool(text, selectedNames) {
  const asksForBothStatuses =
    /\bativos?\s+e\s+inativos?\b/.test(text)
    || /\binativos?\s+e\s+ativos?\b/.test(text)
    || /\btodos os clientes\b/.test(text);

  if (/\bresumo\b/.test(text)) {
    selectedNames.add("resumo_clientes");
    return;
  }

  if (/\bdominio/.test(text)) {
    selectedNames.add("listar_dominios_email");
    return;
  }

  if (/\b(e mail|email)\b/.test(text)) {
    selectedNames.add("buscar_cliente_por_email");
    return;
  }

  if (
    /\b(id|identificador)\b/.test(text)
    && /\bcliente/.test(text)
  ) {
    selectedNames.add("buscar_cliente_por_id");
    return;
  }

  if (
    /\b(nome|chamad|chama se)\b/.test(text)
    && /\bcliente/.test(text)
  ) {
    selectedNames.add("buscar_clientes_por_nome");
    return;
  }

  if (
    /\brecent/.test(text)
    || (
      /\bultim/.test(text)
      && /\b(dia|dias|semana|semanas|mes|meses|ano|anos)\b/.test(
        text,
      )
    )
  ) {
    selectedNames.add("listar_clientes_recentes");
    return;
  }

  if (
    /\binativ/.test(text)
    && !asksForBothStatuses
  ) {
    selectedNames.add("listar_clientes_inativos");
    return;
  }

  selectedNames.add("listar_clientes");
}

export function selectToolDecision(
  pergunta,
  availableTools,
) {
  const text = normalizeText(pergunta);
  const selectedNames = new Set();

  let route = null;

  if (/\bclientes?\b/.test(text)) {
    selectClientTool(text, selectedNames);
  } else {
    route = routeOsQuestion(pergunta);

    for (const toolName of route?.toolNames ?? []) {
      selectedNames.add(toolName);
    }
  }

  const tools = availableTools.filter((tool) =>
    selectedNames.has(tool.function.name)
  );

  return {
    tools,
    route,
  };
}

export function selectTools(
  pergunta,
  availableTools,
) {
  return selectToolDecision(
    pergunta,
    availableTools,
  ).tools;
}
