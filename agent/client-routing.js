import {
  compactEntities,
  extractDays,
  extractLimit,
  extractPersonByPatterns,
  extractPriority,
  extractStatus,
  normalizeText,
} from "./os-routing.js";

export function extractEmail(value) {
  const text = String(value ?? "");
  const match = text.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  );

  return match ? match[0].toLowerCase() : undefined;
}

export function extractClientId(value) {
  const text = normalizeText(value);
  const match = text.match(/\b(?:id|identificador)\s+(\d+)\b/);

  if (!match) {
    return undefined;
  }

  const id = Number(match[1]);

  return Number.isSafeInteger(id) && id > 0
    ? id
    : undefined;
}

export function extractClientName(value) {
  return extractPersonByPatterns(value, [
    /\b(?:cujo\s+)?nome\s+contenha\s+(.+)$/iu,
    /\b(?:com|de|tem|tenha|possui)\s+(?:o\s+)?nome\s+(.+)$/iu,
    /\bnome\s+(?:seja|e|é)\s+(.+)$/iu,
    /\bchama[- ]se\s+(.+)$/iu,
    /\bchamad[oa]s?\s+(.+)$/iu,
    /\binforma\p{L}*\s+(?:sobre|de|do|da)\s+(?:o\s+|a\s+)?(?:clientes?\s+)?(.+)$/iu,
    /\bdados\s+(?:sobre|de|do|da)\s+(?:o\s+|a\s+)?(?:clientes?\s+)?(.+)$/iu,
    /\bdetalhes\s+(?:sobre|de|do|da)\s+(?:o\s+|a\s+)?(?:clientes?\s+)?(.+)$/iu,
  ]);
}

function extractClientNameFromOsQuestion(value) {
  return extractPersonByPatterns(value, [
    /\bclientes?\s+(.+?)\s+(?:j[áa]\s+)?(?:abriu|abriram|resolveu|resolveram|atendeu|atenderam|concluiu|conclu[íi]ram|solicitou|solicitaram|registrou|registraram|criou|criaram|tem|t[êe]m|possui|possuem)\b/iu,
    /\bclientes?\s+(.+)$/iu,
  ]);
}

function createClientDecision(
  intent,
  toolName,
  entities,
) {
  return {
    entity: "cliente",
    intent,
    toolNames: [toolName],
    entities,
    fallback: false,
  };
}

function createClientClarification(
  entities,
  clarification,
) {
  return {
    entity: "cliente",
    intent: "clarification",
    toolNames: [],
    entities,
    fallback: true,
    clarification,
  };
}

export function routeClientQuestion(pergunta) {
  const text = normalizeText(pergunta);

  const email = extractEmail(pergunta);
  const id = extractClientId(pergunta);
  const nome = extractClientName(pergunta);
  const dias = extractDays(pergunta);
  const limite = extractLimit(pergunta);

  const asksForBothStatuses =
    /\bativos?\s+e\s+inativos?\b/.test(text)
    || /\binativos?\s+e\s+ativos?\b/.test(text)
    || /\btodos os clientes\b/.test(text);

  const somenteAtivos = asksForBothStatuses
    ? false
    : (/\bativos?\b/.test(text) ? true : undefined);

  const mentionsActive = /\bativos?\b/.test(text);
  const mentionsInactive = /\binativ/.test(text);

  const ativo = asksForBothStatuses
    ? undefined
    : mentionsActive && !mentionsInactive
      ? true
      : mentionsInactive && !mentionsActive
        ? false
        : undefined;

  const entities = compactEntities({
    email,
    id,
    nome,
    dias,
    limite,
    somenteAtivos,
    ativo,
  });

  if (/\bpor mes\b/.test(text) || /\bmensal/.test(text)) {
    return createClientDecision(
      "resumo_por_mes",
      "resumo_clientes_por_mes",
      entities,
    );
  }

  if (/\bresumo\b/.test(text)) {
    return createClientDecision(
      "resumo",
      "resumo_clientes",
      entities,
    );
  }

  if (/\bdominio/.test(text)) {
    return createClientDecision(
      "dominios",
      "listar_dominios_email",
      entities,
    );
  }

  if (/\b(e mail|email)\b/.test(text)) {
    if (email === undefined) {
      return createClientClarification(
        entities,
        "Informe o e-mail do cliente que deseja buscar.",
      );
    }

    return createClientDecision(
      "buscar_por_email",
      "buscar_cliente_por_email",
      entities,
    );
  }

  if (/\b(id|identificador)\b/.test(text)) {
    if (id === undefined) {
      return createClientClarification(
        entities,
        "Informe o identificador numérico do cliente.",
      );
    }

    return createClientDecision(
      "buscar_por_id",
      "buscar_cliente_por_id",
      entities,
    );
  }

  if (/\b(nome|chamad|chama se)\b/.test(text) || nome !== undefined) {
    if (nome === undefined) {
      return createClientClarification(
        entities,
        "Informe o nome (ou parte dele) do cliente que deseja buscar.",
      );
    }

    return createClientDecision(
      "buscar_por_nome",
      "buscar_clientes_por_nome",
      entities,
    );
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
    return createClientDecision(
      "listar_recentes",
      "listar_clientes_recentes",
      entities,
    );
  }

  if (
    /\binativ/.test(text)
    && !asksForBothStatuses
  ) {
    return createClientDecision(
      "listar_inativos",
      "listar_clientes_inativos",
      entities,
    );
  }

  const mentionsOsEntity =
    /\bOS\b/.test(pergunta)
    || /\b(?:ordem|ordens|chamado|chamados|protocolo|protocolos)\b/.test(
      text,
    );

  if (mentionsOsEntity) {
    const clienteNome = extractClientNameFromOsQuestion(pergunta);

    if (clienteNome === undefined) {
      return createClientClarification(
        entities,
        "Informe o nome do cliente para consultar as ordens de serviço relacionadas.",
      );
    }

    return createClientDecision(
      "os_do_cliente",
      "listar_os_por_cliente",
      compactEntities({
        cliente: clienteNome,
        status: extractStatus(pergunta),
        prioridade: extractPriority(pergunta),
        dias,
        limite,
      }),
    );
  }

  return createClientDecision(
    "listar",
    "listar_clientes",
    entities,
  );
}
