import {
  compactEntities,
  extractLimit,
  normalizeText,
} from "./routing-utils.js";

// "está"/"esta" (singular) ou "estão"/"estao" (plural) — atenção: o plural
// usa "ã" (til), não "á" (agudo), são letras diferentes.
const ESTAR_SOURCE = "est(?:[áa]|[ãa]o)";

const TRAILING_FILTER_CLAUSE_PATTERN = new RegExp(
  `\\s+(?:(?:tem|possui|${ESTAR_SOURCE})\\s+)?(?:com|e|que\\s+(?:tem|${ESTAR_SOURCE})|d[oa]|n[oa])\\s+(?:o\\s+|a\\s+)?(?:status|prioridade|[áa]rea|departamento|operador|respons[áa]vel|atendente|cliente|limite)\\b.*$`,
  "iu",
);

const TRAILING_PAGE_CLAUSE_PATTERN =
  /\s*\(?\s*p[áa]gina\s+\d+\)?\s*$/iu;

// Verbo solto no fim da captura, sem cláusula depois (ex.: "...o operador
// Cesar tem?" → o "tem" sobra porque não há um "no/na/do/da <dimensão>"
// depois dele para o corte acima remover junto).
const TRAILING_BARE_VERB_PATTERN = new RegExp(`\\s+(?:tem|possui|${ESTAR_SOURCE})\\s*$`, "iu");

// "está(m) <situação do ticket>" no fim da frase não faz parte do nome
// capturado (ex.: "departamento COIDS estão com o SLA pausado", "área X
// estão abertos há mais tempo") — corta tudo a partir de "está(m)".
const TRAILING_STATE_CLAUSE_PATTERN = new RegExp(`\\s+${ESTAR_SOURCE}\\s+.+$`, "iu");

// Conecta uma dimensão (status/área/operador/...) ao pedido de resumo: além
// de "por X", aceita "em cada X", "por cada X", "de cada X" e "cada X" (ex.:
// "quantos tickets existem em cada departamento?").
const DIMENSION_CONNECTOR_SOURCE = "(?:por|em\\s+cada|por\\s+cada|de\\s+cada|cada)";

// "Quais operadores possuem mais tickets?" / "...têm mais chamados?" também
// pede um resumo/ranking, mesmo sem a palavra "por" ou "quantos".
const RANKING_CUE_SOURCE = "(?:possu(?:i|em)|tem)\\s+mais";

// Uma dimensão é mencionada tanto pela conexão "por/em cada/cada X" quanto
// pela estrutura de ranking "X ... tem/possui mais" (nome aparece antes).
function mentionsDimension(text, dimensionSource) {
  const connector = new RegExp(`\\b${DIMENSION_CONNECTOR_SOURCE}\\s+(?:${dimensionSource})\\b`);
  const ranking = new RegExp(`\\b(?:${dimensionSource})\\b.*\\b${RANKING_CUE_SOURCE}\\b`);

  return connector.test(text) || ranking.test(text);
}

const ISO_DATE_SOURCE = "\\d{4}-\\d{2}-\\d{2}";

const MONTH_NAME_SOURCE =
  "janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";

const MONTH_NUMBERS = {
  janeiro: "01",
  fevereiro: "02",
  marco: "03",
  abril: "04",
  maio: "05",
  junho: "06",
  julho: "07",
  agosto: "08",
  setembro: "09",
  outubro: "10",
  novembro: "11",
  dezembro: "12",
};

// Data por extenso, ex.: "dia 2 de agosto de 2026" ou "2 de agosto de 2026".
const LONG_DATE_SOURCE =
  `(?:dia\\s+)?\\d{1,2}\\s+de\\s+(?:${MONTH_NAME_SOURCE})\\s+de\\s+\\d{4}`;

// Qualquer formato de data aceito (ISO ou por extenso), como um único token.
const DATE_TOKEN_SOURCE = `(?:${ISO_DATE_SOURCE}|${LONG_DATE_SOURCE})`;

// Normaliza um token de data (ISO ou por extenso) para "AAAA-MM-DD".
function parseDateToken(token) {
  const texto = token.trim();

  if (new RegExp(`^${ISO_DATE_SOURCE}$`).test(texto)) {
    return texto;
  }

  const longMatch = texto.match(
    new RegExp(`^(?:dia\\s+)?(\\d{1,2})\\s+de\\s+(${MONTH_NAME_SOURCE})\\s+de\\s+(\\d{4})$`, "iu"),
  );

  if (!longMatch) {
    return undefined;
  }

  const dia = longMatch[1].padStart(2, "0");
  const mesChave = longMatch[2].toLowerCase().replace("ç", "c");
  const mes = MONTH_NUMBERS[mesChave];
  const ano = longMatch[3];

  return mes === undefined ? undefined : `${ano}-${mes}-${dia}`;
}

const TRAILING_DATE_CLAUSE_PATTERN = new RegExp(
  `\\s+(?:(?:entre|per[íi]odo\\s+de)\\s+${DATE_TOKEN_SOURCE}\\s+(?:e|a|at[ée])\\s+${DATE_TOKEN_SOURCE}`
    + `|desde\\s+${DATE_TOKEN_SOURCE}`
    + `|a\\s+partir\\s+de\\s+${DATE_TOKEN_SOURCE}`
    + `|at[ée]\\s+${DATE_TOKEN_SOURCE})\\s*$`,
  "iu",
);

function cleanFreeText(value) {
  const text = String(value ?? "")
    .split(/[,.!?;:]/u, 1)[0]
    .trim()
    .replace(/^(?:o|a|os|as|de|do|da)\b\s+/iu, "")
    .replace(TRAILING_FILTER_CLAUSE_PATTERN, "")
    .replace(TRAILING_STATE_CLAUSE_PATTERN, "")
    .replace(TRAILING_DATE_CLAUSE_PATTERN, "")
    .replace(TRAILING_PAGE_CLAUSE_PATTERN, "")
    .replace(TRAILING_BARE_VERB_PATTERN, "")
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

// "ticket" tem sinônimos comuns no vocabulário de helpdesk (o próprio
// OcoMon vem de "Ocorrência"); todos são aceitos antes do número.
const TICKET_NOUN_SOURCE = "(?:ticket|chamado|atendimento|ocorrencia|solicitacao)";

export function extractTicketNumber(value) {
  const text = normalizeText(value);

  const patterns = [
    new RegExp(`\\b${TICKET_NOUN_SOURCE}\\s+(?:numero\\s+)?(\\d+)\\b`),
    new RegExp(`\\bnumero\\s+(?:do\\s+)?(?:${TICKET_NOUN_SOURCE}\\s+)?(\\d+)\\b`),
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

export function extractClientName(value) {
  return extractByPatterns(value, [
    /\bcliente\s+(?:chamado\s+|de\s+nome\s+)?(.+)$/iu,
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
      `\\b(?:entre|per[íi]odo\\s+de)\\s+(${DATE_TOKEN_SOURCE})\\s+(?:e|a|at[ée])\\s+(${DATE_TOKEN_SOURCE})\\b`,
      "iu",
    ),
  );

  if (rangeMatch) {
    return {
      dataInicio: parseDateToken(rangeMatch[1]),
      dataFim: parseDateToken(rangeMatch[2]),
    };
  }

  const inicioMatch = text.match(
    new RegExp(`\\b(?:desde|a\\s+partir\\s+de)\\s+(${DATE_TOKEN_SOURCE})\\b`, "iu"),
  );

  const fimMatch = text.match(
    new RegExp(`\\bat[ée]\\s+(${DATE_TOKEN_SOURCE})\\b`, "iu"),
  );

  return compactEntities({
    dataInicio: inicioMatch ? parseDateToken(inicioMatch[1]) : undefined,
    dataFim: fimMatch ? parseDateToken(fimMatch[1]) : undefined,
  });
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

  // "em andamento" é um status real e específico (EM ATENDIMENTO), não um
  // sinônimo genérico de "aberto" — um ticket aguardando resposta também
  // está aberto, mas não está "em andamento".
  const status =
    extractTicketStatusName(pergunta)
    ?? (/\bem\s+andamento\b/.test(text) ? "Em atendimento" : undefined);
  const area = extractAreaName(pergunta);
  const departamento = extractDepartmentName(pergunta);
  const operador = extractOperatorName(pergunta);
  const cliente = extractClientName(pergunta);
  const prioridade = extractPriorityName(pergunta);
  const limite = extractLimit(pergunta);
  const pagina = extractPage(pergunta);
  const { dataInicio, dataFim } = extractDateRange(pergunta);

  const entities = compactEntities({
    status,
    area,
    departamento,
    operador,
    cliente,
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
    || /\bcontagem\b/.test(text)
    || new RegExp(`\\b${RANKING_CUE_SOURCE}\\b`).test(text);

  const mentionsStatusDimension = mentionsDimension(text, "status");
  const mentionsPriorityDimension = mentionsDimension(text, "prioridades?");
  const mentionsAreaDimension = mentionsDimension(text, "areas?");
  const mentionsOperatorDimension = mentionsDimension(text, "operador(?:es)?");
  const mentionsDepartmentDimension = mentionsDimension(text, "departamentos?");

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
    || /\b(?:sla|relogio|tempo|prazo)\s+(?:parad[oa]|pausad[oa]|suspens[oa])\b/.test(text)
  ) {
    return createTicketDecision(
      "listar_congelados",
      "listar_tickets_congelados",
      compactEntities({ status, area, departamento, operador, dataInicio, dataFim, limite }),
    );
  }

  const isOldestOpenIntent =
    /\bmais\s+antig/.test(text)
    || /\bmais\s+velh/.test(text)
    || /\bha\s+mais\s+tempo\b/.test(text);

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

  // "ainda não fechado"/"não encerrado" significam aberto, mas contêm as
  // palavras que indicariam fechado — por isso são tratadas à parte, negando
  // isFechadoIntent e alimentando isAbertoIntent.
  const NEGATED_CLOSED_SOURCE =
    "nao\\s+(?:esta\\s+|estao\\s+|foi\\s+|foram\\s+)?(?:fechad[oa]s?|encerrad[oa]s?|concluid[oa]s?|finalizad[oa]s?)";
  const isNegatedClosed = new RegExp(`\\b${NEGATED_CLOSED_SOURCE}\\b`).test(text);

  const isAbertoIntent =
    /\babert[oa]s?\b/.test(text)
    || /\bpendente/.test(text)
    || isNegatedClosed;

  const isFechadoIntent =
    (
      /\bfechad[oa]s?\b/.test(text)
      || /\bencerrad[oa]s?\b/.test(text)
      || /\bconcluid[oa]s?\b/.test(text)
      || /\bfinalizad[oa]s?\b/.test(text)
    )
    && !isNegatedClosed;

  // Situação (aberto/fechado) só é definida quando a frase menciona uma das
  // duas de forma inequívoca — se mencionar as duas, "mais recentes" segue
  // sem filtro de situação, e a frase cai no fallback de qualquer forma.
  const situacaoParaMaisRecentes =
    isFechadoIntent && !isAbertoIntent
      ? "fechado"
      : isAbertoIntent && !isFechadoIntent
        ? "aberto"
        : undefined;

  // "primeiros N tickets" não tem ordenação garantida no restante do
  // sistema (listar_tickets usa a paginação bruta da API); tratamos como
  // sinônimo de "mais recentes N" pra dar uma ordem previsível e explícita.
  const isMostRecentIntent =
    /\brecent/.test(text)
    || /\bultimo/.test(text)
    || /\bmais\s+nov[oa]/.test(text)
    || /\brecem\b/.test(text)
    || /\bprimeir[oa]s?\b/.test(text);

  if (isMostRecentIntent) {
    const numeroSolto = text.match(/\b(\d+)\b/);

    return createTicketDecision(
      "listar_mais_recentes",
      "listar_tickets_mais_recentes",
      compactEntities({
        status,
        area,
        departamento,
        operador: extractOperatorNameForSituacao(pergunta),
        situacao: situacaoParaMaisRecentes,
        limite: limite ?? (numeroSolto ? Number(numeroSolto[1]) : undefined),
      }),
    );
  }

  if (isAbertoIntent && !isFechadoIntent) {
    return createTicketDecision(
      "listar_abertos",
      "listar_tickets_abertos",
      compactEntities({
        area,
        departamento,
        operador: extractOperatorNameForSituacao(pergunta),
        dataInicio,
        dataFim,
        limite,
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
        dataInicio,
        dataFim,
        limite,
      }),
    );
  }

  const isSemOperadorIntent =
    /\bsem\s+(?:operador|responsavel|atendente)\b/.test(text)
    || /\bnao\s+(?:foi\s+|foram\s+|esta\s+|estao\s+)?atribuid/.test(text)
    || /\bninguem\s+(?:e\s+)?responsavel\b/.test(text)
    || /\baguardando\s+atribuicao\b/.test(text);

  if (isSemOperadorIntent) {
    return createTicketDecision(
      "listar_sem_operador",
      "listar_tickets_sem_operador",
      compactEntities({ status, area, departamento, dataInicio, dataFim, limite }),
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
