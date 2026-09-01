import {
  compactEntities,
  extractLimit,
  normalizeText,
} from "./routing-utils.js";

const TRAILING_FILTER_CLAUSE_PATTERN =
  /\s+(?:com|e|que\s+(?:tem|est[áa]))\s+(?:o\s+|a\s+)?(?:status|prioridade|[áa]rea|departamento|operador|respons[áa]vel|atendente|limite)\b.*$/iu;

const TRAILING_PAGE_CLAUSE_PATTERN =
  /\s*\(?\s*p[áa]gina\s+\d+\)?\s*$/iu;

const ISO_DATE_SOURCE = "\\d{4}-\\d{2}-\\d{2}";

const TRAILING_DATE_CLAUSE_PATTERN = new RegExp(
  `\\s+(?:(?:entre|per[íi]odo\\s+de)\\s+${ISO_DATE_SOURCE}\\s+(?:e|a|at[ée])\\s+${ISO_DATE_SOURCE}`
    + `|desde\\s+${ISO_DATE_SOURCE}`
    + `|a\\s+partir\\s+de\\s+${ISO_DATE_SOURCE}`
    + `|at[ée]\\s+${ISO_DATE_SOURCE})\\s*$`,
  "iu",
);

function cleanFreeText(value) {
  const text = String(value ?? "")
    .split(/[,.!?;:]/u, 1)[0]
    .trim()
    .replace(/^(?:o|a|os|as|de|do|da)\b\s+/iu, "")
    .replace(TRAILING_FILTER_CLAUSE_PATTERN, "")
    .replace(TRAILING_DATE_CLAUSE_PATTERN, "")
    .replace(TRAILING_PAGE_CLAUSE_PATTERN, "")
    .trim();

  return text.length >= 1 && text.length <= 100 ? text : undefined;
}

function extractByPatterns(value, patterns) {
  const originalText = String(value ?? "");

  for (const pattern of patterns) {
    const match = originalText.match(pattern);

    if (!match) {
      continue;
    }

    const cleaned = cleanFreeText(match[1]);

    if (cleaned !== undefined) {
      return cleaned;
    }
  }

  return undefined;
}

export function extractTicketNumber(value) {
  const text = normalizeText(value);

  const patterns = [
    /\bticket\s+(?:numero\s+)?(\d+)\b/,
    /\bnumero\s+(?:do\s+)?(?:ticket\s+)?(\d+)\b/,
    /\bn[°º]\s*(\d+)\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    const numero = Number(match[1]);

    if (
      Number.isSafeInteger(numero)
      && numero > 0
      && numero <= 2147483647
    ) {
      return numero;
    }
  }

  return undefined;
}

export function extractAreaName(value) {
  return extractByPatterns(value, [
    /(?<![\p{L}\p{N}])[áa]rea\s+(?:de\s+)?(.+)$/iu,
  ]);
}

export function extractDepartmentName(value) {
  return extractByPatterns(value, [
    /\bdepartamento\s+(?:de\s+)?(.+)$/iu,
  ]);
}

export function extractOperatorName(value) {
  return extractByPatterns(value, [
    /\b(?:operador|respons[áa]vel|atendente|usu[áa]rio)\s+(.+)$/iu,
  ]);
}

export function extractTicketStatusName(value) {
  return extractByPatterns(value, [
    /\bstatus\s+(?:de\s+)?(.+)$/iu,
  ]);
}

export function extractPriorityName(value) {
  return extractByPatterns(value, [
    /\bprioridade\s+(?:de\s+)?(.+)$/iu,
  ]);
}

export function extractUserName(value) {
  return extractByPatterns(value, [
    /\b(?:busque|busca|procure|procura|encontre|encontra)\s+(?:o\s+|a\s+)?usu[áa]rios?\s+(?:chamados?\s+|de\s+nome\s+)?(.+)$/iu,
    /\busu[áa]rio\s+(?:chamado\s+|de\s+nome\s+)(.+)$/iu,
    /\bquem\s+[ée]\s+(?:o\s+|a\s+)?usu[áa]rio\s+(.+)$/iu,
    /\binforma[çc][õo]es\s+(?:do|sobre\s+o)\s+usu[áa]rio\s+(.+)$/iu,
  ]);
}

function extractOperatorNameForSituacao(value) {
  return extractByPatterns(value, [
    /\b(?:operador|respons[áa]vel|atendente)\s+(.+)$/iu,
    /\bpor\s+(?!status\b|prioridade\b|[áa]rea\b|departamento\b|operador\b|p[áa]gina\b)(.+)$/iu,
  ]);
}

export function extractDateRange(value) {
  const text = String(value ?? "");

  const rangeMatch = text.match(
    new RegExp(
      `\\b(?:entre|per[íi]odo\\s+de)\\s+(${ISO_DATE_SOURCE})\\s+(?:e|a|at[ée])\\s+(${ISO_DATE_SOURCE})\\b`,
      "iu",
    ),
  );

  if (rangeMatch) {
    return { dataInicio: rangeMatch[1], dataFim: rangeMatch[2] };
  }

  const dataInicio = text.match(
    new RegExp(`\\b(?:desde|a\\s+partir\\s+de)\\s+(${ISO_DATE_SOURCE})\\b`, "iu"),
  )?.[1];

  const dataFim = text.match(
    new RegExp(`\\bat[ée]\\s+(${ISO_DATE_SOURCE})\\b`, "iu"),
  )?.[1];

  return compactEntities({ dataInicio, dataFim });
}

export function extractPage(value) {
  const text = normalizeText(value);
  const matches = [...text.matchAll(/\bpagina\s+(\d+)\b/g)];

  if (matches.length === 0) {
    return undefined;
  }

  const pagina = Number(matches[matches.length - 1][1]);

  return Number.isSafeInteger(pagina) && pagina > 0 && pagina <= 2147483647
    ? pagina
    : undefined;
}

const META_INTENTS = [
  {
    tool: "listar_areas_tickets",
    patterns: [
      /\bquais\s+areas\b/,
      /\bliste\s+as\s+areas\b/,
      /\blistar\s+areas\b/,
      /\bareas\s+existem\b/,
    ],
  },
  {
    tool: "listar_prioridades_tickets",
    patterns: [
      /\bquais\s+prioridades\b/,
      /\bliste\s+as\s+prioridades\b/,
      /\blistar\s+prioridades\b/,
      /\bprioridades\s+existem\b/,
    ],
  },
  {
    tool: "listar_canais_tickets",
    patterns: [
      /\bquais\s+canais\b/,
      /\bliste\s+os\s+canais\b/,
      /\blistar\s+canais\b/,
      /\bcanais\s+existem\b/,
      /\bcanais\s+de\s+entrada\b/,
    ],
  },
  {
    tool: "listar_status_tickets",
    patterns: [
      /\bquais\s+status\b/,
      /\bliste\s+os\s+status\b/,
      /\blistar\s+status\b/,
      /\bstatus\s+existem\b/,
      /\bstatus\s+possiveis\b/,
    ],
  },
  {
    tool: "listar_departamentos_tickets",
    patterns: [
      /\bquais\s+departamentos\b/,
      /\bliste\s+os\s+departamentos\b/,
      /\blistar\s+departamentos\b/,
      /\bdepartamentos\s+existem\b/,
    ],
  },
  {
    tool: "listar_usuarios_tickets",
    patterns: [
      /\bquais\s+usuarios\b/,
      /\bliste\s+os\s+usuarios\b/,
      /\blistar\s+usuarios\b/,
      /\busuarios\s+existem\b/,
      /\bquais\s+operadores\b/,
      /\boperadores\s+existem\b/,
    ],
  },
];

function createTicketDecision(intent, toolName, entities) {
  return {
    entity: "ticket",
    intent,
    toolNames: [toolName],
    entities,
    fallback: false,
  };
}

export function routeTicketQuestion(pergunta) {
  const text = normalizeText(pergunta);

  const numero = extractTicketNumber(pergunta);
  const status = extractTicketStatusName(pergunta);
  const area = extractAreaName(pergunta);
  const departamento = extractDepartmentName(pergunta);
  const operador = extractOperatorName(pergunta);
  const prioridade = extractPriorityName(pergunta);
  const limite = extractLimit(pergunta);
  const pagina = extractPage(pergunta);
  const { dataInicio, dataFim } = extractDateRange(pergunta);

  const entities = compactEntities({
    status,
    area,
    departamento,
    operador,
    prioridade,
    numero,
    dataInicio,
    dataFim,
    limite,
    pagina,
  });

  const hasResumoIntent =
    /\bresumo\b/.test(text)
    || /\bdistribuicao\b/.test(text)
    || /\bquantidade\b/.test(text)
    || /\bquantos\b/.test(text)
    || /\bquantas\b/.test(text)
    || /\bcontagem\b/.test(text);

  const mentionsStatusDimension = /\bpor\s+status\b/.test(text);
  const mentionsPriorityDimension = /\bpor\s+prioridades?\b/.test(text);
  const mentionsAreaDimension = /\bpor\s+areas?\b/.test(text);
  const mentionsOperatorDimension = /\bpor\s+operador(?:es)?\b/.test(text);
  const mentionsDepartmentDimension = /\bpor\s+departamentos?\b/.test(text);

  if (hasResumoIntent && mentionsStatusDimension) {
    return createTicketDecision(
      "resumo_por_status",
      "resumo_tickets_por_status",
      compactEntities({ area, departamento, operador }),
    );
  }

  if (hasResumoIntent && mentionsPriorityDimension) {
    return createTicketDecision(
      "resumo_por_prioridade",
      "resumo_tickets_por_prioridade",
      compactEntities({ status, area, departamento, operador }),
    );
  }

  if (hasResumoIntent && mentionsAreaDimension) {
    return createTicketDecision(
      "resumo_por_area",
      "resumo_tickets_por_area",
      compactEntities({ status, departamento, operador }),
    );
  }

  if (hasResumoIntent && mentionsOperatorDimension) {
    return createTicketDecision(
      "resumo_por_operador",
      "resumo_tickets_por_operador",
      compactEntities({ status, area, departamento }),
    );
  }

  if (hasResumoIntent && mentionsDepartmentDimension) {
    return createTicketDecision(
      "resumo_por_departamento",
      "resumo_tickets_por_departamento",
      compactEntities({ status, area, operador }),
    );
  }

  if (numero !== undefined) {
    return createTicketDecision(
      "buscar_por_numero",
      "buscar_ticket_por_numero",
      { numero },
    );
  }

  if (
    /\bcongelad/.test(text)
    || /\btravad/.test(text)
    || /\bparalisad/.test(text)
  ) {
    return createTicketDecision(
      "listar_congelados",
      "listar_tickets_congelados",
      compactEntities({ status, area, departamento, operador }),
    );
  }

  const isOldestOpenIntent = /\bmais\s+antig/.test(text) || /\bmais\s+velh/.test(text);

  if (isOldestOpenIntent) {
    const numeroSolto = text.match(/\b(\d+)\b/);

    return createTicketDecision(
      "listar_abertos_mais_antigos",
      "listar_tickets_abertos_mais_antigos",
      compactEntities({
        area,
        departamento,
        operador: extractOperatorNameForSituacao(pergunta),
        limite: limite ?? (numeroSolto ? Number(numeroSolto[1]) : undefined),
      }),
    );
  }

  const isAbertoIntent = /\babert[oa]s?\b/.test(text);
  const isFechadoIntent = /\bfechad[oa]s?\b/.test(text);

  if (isAbertoIntent && !isFechadoIntent) {
    return createTicketDecision(
      "listar_abertos",
      "listar_tickets_abertos",
      compactEntities({
        area,
        departamento,
        operador: extractOperatorNameForSituacao(pergunta),
      }),
    );
  }

  if (isFechadoIntent && !isAbertoIntent) {
    return createTicketDecision(
      "listar_fechados",
      "listar_tickets_fechados",
      compactEntities({
        area,
        departamento,
        operador: extractOperatorNameForSituacao(pergunta),
      }),
    );
  }

  const isSemOperadorIntent =
    /\bsem\s+operador\b/.test(text) || /\bnao\s+atribuid/.test(text);

  if (isSemOperadorIntent) {
    return createTicketDecision(
      "listar_sem_operador",
      "listar_tickets_sem_operador",
      compactEntities({ status, area, departamento }),
    );
  }

  const nomeUsuario = extractUserName(pergunta);

  if (nomeUsuario !== undefined) {
    return createTicketDecision(
      "buscar_usuario_por_nome",
      "buscar_usuarios_por_nome",
      { nome: nomeUsuario },
    );
  }

  for (const metaIntent of META_INTENTS) {
    if (metaIntent.patterns.some((pattern) => pattern.test(text))) {
      return createTicketDecision(
        metaIntent.tool,
        metaIntent.tool,
        {},
      );
    }
  }

  return createTicketDecision(
    "listar",
    "listar_tickets",
    entities,
  );
}
