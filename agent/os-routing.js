export const STATUS_ALIASES = Object.freeze({
  aberta: Object.freeze([
    "aberta",
    "abertas",
    "aberto",
    "abertos",
    "em aberto",
  ]),

  em_andamento: Object.freeze([
    "em andamento",
    "andamento",
    "sendo atendida",
    "sendo atendidas",
    "sendo atendido",
    "sendo atendidos",
    "em execução",
    "em execucao",
    "em processamento",
    "em tratamento",
    "em atendimento",
  ]),

  aguardando: Object.freeze([
    "aguardando",
    "em espera",
    "esperando",
    "aguardando retorno",
    "aguardando resposta",
    "aguardando atendimento",
    "pendente de retorno",
    "pendentes de retorno",
  ]),

  concluida: Object.freeze([
    "concluída",
    "concluídas",
    "concluído",
    "concluídos",
    "concluida",
    "concluidas",
    "concluido",
    "concluidos",
    "finalizada",
    "finalizadas",
    "finalizado",
    "finalizados",
    "resolvida",
    "resolvidas",
    "resolvido",
    "resolvidos",
    "resolveu",
    "resolveram",
    "encerrada",
    "encerradas",
    "encerrado",
    "encerrados",
    "fechada",
    "fechadas",
    "fechado",
    "fechados",
  ]),

  cancelada: Object.freeze([
    "cancelada",
    "canceladas",
    "cancelado",
    "cancelados",
    "anulada",
    "anuladas",
    "anulado",
    "anulados",
    "invalidada",
    "invalidadas",
    "invalidado",
    "invalidados",
  ]),
});

export const PRIORITY_ALIASES = Object.freeze({
  baixa: Object.freeze([
    "baixa",
    "baixas",
    "baixo",
    "baixos",
    "prioridade baixa",
  ]),

  media: Object.freeze([
    "média",
    "médias",
    "médio",
    "médios",
    "media",
    "medias",
    "medio",
    "medios",
    "prioridade média",
    "prioridade media",
  ]),

  alta: Object.freeze([
    "alta",
    "altas",
    "alto",
    "altos",
    "prioridade alta",
  ]),

  critica: Object.freeze([
    "crítica",
    "críticas",
    "crítico",
    "críticos",
    "critica",
    "criticas",
    "critico",
    "criticos",
    "prioridade crítica",
    "prioridade critica",
  ]),
});

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(text, phrase) {
  return ` ${text} `.includes(` ${phrase} `);
}

function isNegated(text, phrase) {
  return [
    `nao ${phrase}`,
    `nao foi ${phrase}`,
    `nao foram ${phrase}`,
    `nao esta ${phrase}`,
    `nao estao ${phrase}`,
  ].some((candidate) => containsPhrase(text, candidate));
}

function extractCanonicalValue(value, aliases) {
  const text = normalizeText(value);

  for (const [canonical, naturalTerms] of Object.entries(aliases)) {
    const sortedTerms = naturalTerms
      .map(normalizeText)
      .sort((left, right) => right.length - left.length);

    for (const term of sortedTerms) {
      if (
        containsPhrase(text, term)
        && !isNegated(text, term)
      ) {
        return canonical;
      }
    }
  }

  return undefined;
}

export function extractStatus(value) {
  return extractCanonicalValue(value, STATUS_ALIASES);
}

export function extractPriority(value) {
  const text = String(value ?? "").replace(
    /\b(?:tempo|prazo)\s+m[ée]dio\b/giu,
    "",
  );

  return extractCanonicalValue(text, PRIORITY_ALIASES);
}

export function extractOsNumber(value) {
  const text = normalizeText(value);

  const patterns = [
    /\bnumero da os\s+(\d+)\b/,
    /\bos\s+(?:(?:de numero|com (?:o )?numero)\s+)?(\d+)\b/,
    /\bordem de servico\s+(?:(?:de numero|com (?:o )?numero)\s+)?(\d+)\b/,
    /\bordem\s+(?:(?:de numero|com (?:o )?numero)\s+)?(\d+)\b/,
    /\bchamado\s+(\d+)\b/,
    /\bprotocolo\s+(\d+)\b/,
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

function periodToDays(amount, unit) {
  const factors = {
    dia: 1,
    dias: 1,
    semana: 7,
    semanas: 7,
    mes: 30,
    meses: 30,
    ano: 365,
    anos: 365,
  };

  const factor = factors[unit];
  const days = amount * factor;

  if (
    !Number.isSafeInteger(days)
    || days < 1
    || days > 3650
  ) {
    return undefined;
  }

  return days;
}

export function extractDays(value) {
  const text = normalizeText(value);

  const quantifiedPatterns = [
    /\b(?:(?:nos|nas|no|na)\s+)?ultim(?:o|os|a|as)\s+(\d+)\s+(dia|dias|semana|semanas|mes|meses|ano|anos)\b/,
    /\bperiodo\s+de\s+(\d+)\s+(dia|dias|semana|semanas|mes|meses|ano|anos)\b/,
    /\bdurante\s+(?:os|as)?\s*(\d+)\s+(dia|dias|semana|semanas|mes|meses|ano|anos)\b/,
  ];

  for (const pattern of quantifiedPatterns) {
    const match = text.match(pattern);

    if (match) {
      return periodToDays(
        Number(match[1]),
        match[2],
      );
    }
  }

  const singlePeriodMatch = text.match(
    /\b(?:(?:no|na)\s+)?ultim(?:o|a)\s+(dia|semana|mes|ano)\b/,
  );

  if (singlePeriodMatch) {
    return periodToDays(
      1,
      singlePeriodMatch[1],
    );
  }

  return undefined;
}

export function extractLimit(value) {
  const text = normalizeText(value);

  const patterns = [
    /\blimite(?:\s+de)?\s+(\d+)\b/,
    /\bno maximo(?:\s+de)?\s+(\d+)\s+(?:resultado|resultados|registro|registros|os|ordem|ordens|chamado|chamados)\b/,
    /\bprimeir(?:o|os|a|as)\s+(\d+)\s+(?:resultado|resultados|registro|registros|os|ordem|ordens|chamado|chamados)\b/,
    /\bate\s+(\d+)\s+(?:resultado|resultados|registro|registros|os|ordem|ordens|chamado|chamados)\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    const limit = Number(match[1]);

    if (
      Number.isSafeInteger(limit)
      && limit >= 1
      && limit <= 100
    ) {
      return limit;
    }

    return undefined;
  }

  return undefined;
}
const NON_NAME_WORDS = /\b(?:tem|têm|ha|há|existe|existem|mais|atendimento|resolucao|resolução|resposta|tempo|prazo|ja|já|resolveu|resolveram|atendeu|atenderam|concluiu|concluíram|concluiram|fechou|fecharam|encerrou|encerraram|finalizou|finalizaram|abriu|abriram|solicitou|solicitaram|registrou|registraram|criou|criaram|cada|respons[áa]vel|respons[áa]veis|solicitante|solicitantes)\b/iu;

export function cleanPersonName(value) {
  let candidate = String(value ?? "")
    .split(/[,.!?;:]/u, 1)[0]
    .trim()
    .replace(/^(?:o|a|os|as)\b\s+/iu, "");

  candidate = candidate
    .replace(
      /\s+(?:(?:nos|nas|no|na)\s+últim(?:o|os|a|as)\b).*$/iu,
      "",
    )
    .replace(
      /\s+(?:(?:que\s+)?(?:tem|têm|possui|possuem|está|estão|esta|estao)\s+)?(?:(?:com|de)\s+)?(?:status|prioridade|limite)\b.*$/iu,
      "",
    )
    .replace(
      /\s+(?:em andamento|em espera|aguardando\b.*|cancelad\p{L}*|concluíd\p{L}*|concluid\p{L}*|atrasad\p{L}*|vencid\p{L}*)\b.*$/iu,
      "",
    )
    .replace(
      /\s+(?:(?:do|da|e|que\s+foi|que\s+esta)\s+)?(?:solicitante|requerente|responsável|responsavel|técnico|tecnico|atendente)\b.*$/iu,
      "",
    )
    .replace(
      /\s+(?:(?:do|da|e|que\s+foi|que\s+esta)\s+)?(?:solicitad[oa]s?|registrad[oa]s?|abert[oa]s?|criad[oa]s?|atribuíd[oa]s?|atendid[oa]s?|designad[oa]s?)\s+(?:por|pelo|pela|a|ao|à)\b.*$/iu,
      "",
    )
    .trim();

  if (
    candidate.length < 2
    || candidate.length > 150
    || NON_NAME_WORDS.test(candidate)
    || !/^[\p{L}\p{M}][\p{L}\p{M}'’.-]*(?:\s+[\p{L}\p{M}][\p{L}\p{M}'’.-]*)*$/u.test(
      candidate,
    )
  ) {
    return undefined;
  }

  const normalizedCandidate = normalizeText(candidate);

  const invalidNames = new Set([
    "os",
    "ordem",
    "ordens",
    "chamado",
    "chamados",
    "status",
    "prioridade",
    "responsavel",
    "solicitante",
    "todos",
    "todas",
  ]);

  if (invalidNames.has(normalizedCandidate)) {
    return undefined;
  }

  return candidate;
}

export function extractPersonByPatterns(value, patterns) {
  const originalText = String(value ?? "");

  for (const pattern of patterns) {
    const match = originalText.match(pattern);

    if (!match) {
      continue;
    }

    const person = cleanPersonName(match[1]);

    if (person !== undefined) {
      return person;
    }
  }

  return undefined;
}

export function extractRequester(value) {
  return extractPersonByPatterns(value, [
    /\b(?:solicitante|requerente)\s*(?::|-)?\s+(.+)$/iu,
    /\b(?:solicitad[oa]s?|registrad[oa]s?|abert[oa]s?|criad[oa]s?)\s+(?:por|pelo|pela)\s+(.+)$/iu,
    /\b(?:o|a|os|as)\s+(.+?)\s+(?:j[áa]\s+)?(?:abriu|abriram|solicitou|solicitaram|registrou|registraram|criou|criaram)\b/iu,
  ]);
}

const RESPONSIBLE_GENITIVE_TERMS = [
  ...Object.values(STATUS_ALIASES).flat(),
  ...Object.values(PRIORITY_ALIASES).flat(),
  "atrasada",
  "atrasadas",
  "atrasado",
  "atrasados",
  "vencida",
  "vencidas",
  "vencido",
  "vencidos",
]
  .filter((term) => !term.includes(" "))
  .sort((left, right) => right.length - left.length)
  .join("|");

const RESPONSIBLE_GENITIVE_PATTERN = new RegExp(
  `\\b(?:${RESPONSIBLE_GENITIVE_TERMS})\\s+(?:do|da|de)\\s+(?!(?:prioridade|status|número|numero|solicitante|responsável|responsavel|alta|baixa|média|media|crítica|critica)\\b)(.+)$`,
  "iu",
);

export function extractResponsible(value) {
  return extractPersonByPatterns(value, [
    /\b(?:responsável|responsavel|técnico|tecnico|atendente)\s*(?::|-)?\s+(.+)$/iu,
    /\b(?:atribuíd[oa]s?|atribuid[oa]s?|designad[oa]s?|atendid[oa]s?)\s+(?:a|ao|à|por|pelo|pela)\s+(.+)$/iu,
    RESPONSIBLE_GENITIVE_PATTERN,
    /\b(?:o|a|os|as)\s+(.+?)\s+(?:j[áa]\s+)?(?:resolveu|resolveram|atendeu|atenderam|concluiu|conclu[íi]ram|fechou|fecharam|encerrou|encerraram|finalizou|finalizaram)\b/iu,
  ]);
}
const REQUESTER_AMBIGUOUS_VERB_TERMS = Object.freeze([
  "abriu",
  "abriram",
  "solicitou",
  "solicitaram",
  "registrou",
  "registraram",
  "criou",
  "criaram",
]);

const RESPONSIBLE_AMBIGUOUS_VERB_TERMS = Object.freeze([
  "resolveu",
  "resolveram",
  "atendeu",
  "atenderam",
  "concluiu",
  "concluíram",
  "concluiram",
  "fechou",
  "fecharam",
  "encerrou",
  "encerraram",
  "finalizou",
  "finalizaram",
]);

export const INTENT_PATTERNS = Object.freeze({
  history: Object.freeze([
    "histórico",
    "historico",
    "movimentação",
    "movimentações",
    "movimentacao",
    "movimentacoes",
    "eventos",
    "linha do tempo",
    "timeline",
    "ocorrências",
    "ocorrencias",
    "alterações realizadas",
    "alteracoes realizadas",
    "mudanças registradas",
    "mudancas registradas",
    "quem alterou",
    "quem concluiu",
    "quem cancelou",
    "quando mudou",
    "quando foi concluída",
    "quando foi concluida",
    "quando foi cancelada",
  ]),

  overdue: Object.freeze([
    "atrasada",
    "atrasadas",
    "atrasado",
    "atrasados",
    "vencida",
    "vencidas",
    "vencido",
    "vencidos",
    "fora do prazo",
    "fora dos prazos",
    "prazo vencido",
    "prazos vencidos",
    "prazo estourado",
    "prazos estourados",
    "em atraso",
    "overdue",
  ]),

  open: Object.freeze([
    "aberta",
    "abertas",
    "aberto",
    "abertos",
    "em aberto",
    "pendente",
    "pendentes",
    "a resolver",
    "não concluída",
    "não concluídas",
    "nao concluida",
    "nao concluidas",
    "não finalizada",
    "não finalizadas",
    "nao finalizada",
    "nao finalizadas",
    "não encerrada",
    "não encerradas",
    "nao encerrada",
    "nao encerradas",
    "ativas",
  ]),

  requester: Object.freeze([
    "solicitante",
    "solicitantes",
    "solicitado por",
    "solicitada por",
    "solicitadas por",
    "solicitado pelo",
    "solicitada pela",
    "solicitadas pela",
    "registrado por",
    "registrada por",
    "registradas por",
    "registrado pelo",
    "registrada pela",
    "registradas pela",
    "aberto por",
    "aberta por",
    "abertas por",
    "aberto pelo",
    "aberta pela",
    "abertas pela",
    "criado por",
    "criada por",
    "criadas por",
    "criado pelo",
    "criada pela",
    "criadas pela",
    "requerente",
    "requerentes",
    "quem abriu",
    "quem registrou",
    "quem solicitou",
    ...REQUESTER_AMBIGUOUS_VERB_TERMS,
  ]),

  responsible: Object.freeze([
    "responsável",
    "responsavel",
    "responsáveis",
    "responsaveis",
    "atribuída a",
    "atribuídas a",
    "atribuido a",
    "atribuidos a",
    "atribuída ao",
    "atribuídas ao",
    "atribuido ao",
    "atribuidos ao",
    "designada a",
    "designadas a",
    "designado a",
    "designados a",
    "técnico",
    "tecnico",
    "técnicos",
    "tecnicos",
    "atendente",
    "atendentes",
    "atendida por",
    "atendidas por",
    "atendido por",
    "atendidos por",
    "atendida pela",
    "atendidas pela",
    "atendido pela",
    "atendidos pela",
    "atendida pelo",
    "atendidas pelo",
    "atendido pelo",
    "atendidos pelo",
    "quem está responsável",
    "quem esta responsavel",
    "os do responsável",
    "os do responsavel",
    "os da responsável",
    "os da responsavel",
    ...RESPONSIBLE_AMBIGUOUS_VERB_TERMS,
  ]),

  statusSummary: Object.freeze([
    "resumo por status",
    "resumo dos status",
    "distribuição por status",
    "distribuicao por status",
    "quantidade por status",
    "quantidades por status",
    "contagem por status",
    "total por status",
    "totais por status",
    "número de os por status",
    "numero de os por status",
  ]),

  prioritySummary: Object.freeze([
    "resumo por prioridade",
    "distribuição por prioridade",
    "distribuicao por prioridade",
    "quantidade por prioridade",
    "contagem por prioridade",
    "total por prioridade",
    "totais por prioridade",
    "número de os por prioridade",
    "numero de os por prioridade",
  ]),

  count: Object.freeze([
    "resumo",
    "distribuição",
    "distribuicao",
    "quantas",
    "quantos",
    "quantidade",
    "quantidades",
    "contagem",
    "total",
    "totais",
    "número de",
    "numero de",
  ]),

  averageTime: Object.freeze([
    "tempo médio",
    "tempo medio",
    "tempo médio de atendimento",
    "tempo medio de atendimento",
    "tempo médio de resolução",
    "tempo medio de resolucao",
    "tempo de atendimento",
    "tempo de resolução",
    "tempo de resolucao",
    "prazo médio",
    "prazo medio",
    "prazo médio de atendimento",
    "prazo medio de atendimento",
    "quanto tempo leva",
    "quanto tempo demora",
    "quanto tempo demoram",
  ]),

  recent: Object.freeze([
    "recente",
    "recentes",
    "mais recente",
    "mais recentes",
    "recentemente",
    "últimas os",
    "ultimas os",
    "últimos chamados",
    "ultimos chamados",
    "últimas ordens",
    "ultimas ordens",
    "novas os",
    "novas ordens",
  ]),
});

function hasOnlyAmbiguousVerbMatch(text, allTerms, ambiguousTerms) {
  const hasAmbiguousTerm = containsAnyPhrase(text, ambiguousTerms);

  const explicitTerms = allTerms.filter(
    (term) => !ambiguousTerms.includes(term),
  );

  const hasExplicitTerm = containsAnyPhrase(text, explicitTerms);

  return hasAmbiguousTerm && !hasExplicitTerm;
}

export function hasAmbiguousResponsibleExtraction(value) {
  const text = normalizeText(value);

  return hasOnlyAmbiguousVerbMatch(
    text,
    INTENT_PATTERNS.responsible,
    RESPONSIBLE_AMBIGUOUS_VERB_TERMS,
  );
}

export function hasAmbiguousRequesterExtraction(value) {
  const text = normalizeText(value);

  return hasOnlyAmbiguousVerbMatch(
    text,
    INTENT_PATTERNS.requester,
    REQUESTER_AMBIGUOUS_VERB_TERMS,
  );
}

const OS_ENTITY_TERMS = Object.freeze([
  "os",
  "ordem",
  "ordens",
  "ordem de serviço",
  "ordens de serviço",
  "ordem de servico",
  "ordens de servico",
  "chamado",
  "chamados",
  "protocolo",
  "protocolos",
]);

function containsAnyPhrase(text, phrases) {
  return phrases.some((phrase) =>
    containsPhrase(text, normalizeText(phrase))
  );
}

export function compactEntities(values) {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([, value]) => value !== undefined,
    ),
  );
}

function createDecision(
  intent,
  toolName,
  entities,
) {
  return {
    entity: "os",
    intent,
    toolNames: [toolName],
    entities,
    fallback: false,
  };
}

function createClarification(
  entities,
  clarification,
) {
  return {
    entity: "os",
    intent: "clarification",
    toolNames: [],
    entities,
    fallback: true,
    clarification,
  };
}

export function routeOsQuestion(value) {
  const originalText = String(value ?? "");
  const text = normalizeText(originalText);

  const numero = extractOsNumber(originalText);
  const status = extractStatus(originalText);
  const prioridade = extractPriority(originalText);
  const dias = extractDays(originalText);
  const limite = extractLimit(originalText);
  const responsavel = extractResponsible(originalText);
  const solicitante = extractRequester(originalText);

  const entities = compactEntities({
    numero,
    status,
    prioridade,
    dias,
    limite,
    responsavel,
    solicitante,
  });

  const mentionsClient =
    containsPhrase(text, "cliente")
    || containsPhrase(text, "clientes");

  const hasNamedOsEntity = containsAnyPhrase(
    text,
    OS_ENTITY_TERMS.filter((term) => term !== "os"),
  );

  const hasOsAcronym =
    /\bOS\b/.test(originalText)
    || containsPhrase(text, "os");

  const hasCountIntent = containsAnyPhrase(
    text,
    INTENT_PATTERNS.count,
  );

  const mentionsStatusDimension =
    containsPhrase(text, "status");

  const mentionsPriorityDimension =
    containsPhrase(text, "prioridade");

  const hasStatusSummary =
    containsAnyPhrase(
      text,
      INTENT_PATTERNS.statusSummary,
    )
    || (
      hasCountIntent
      && mentionsStatusDimension
    );

  const hasPrioritySummary =
    containsAnyPhrase(
      text,
      INTENT_PATTERNS.prioritySummary,
    )
    || (
      hasCountIntent
      && mentionsPriorityDimension
    );

  const hasAverageTimeIntent = containsAnyPhrase(
    text,
    INTENT_PATTERNS.averageTime,
  );

  const hasHistoryIntent = containsAnyPhrase(
    text,
    INTENT_PATTERNS.history,
  );

  const hasOverdueIntent = containsAnyPhrase(
    text,
    INTENT_PATTERNS.overdue,
  );

  const hasRecentIntent = containsAnyPhrase(
    text,
    INTENT_PATTERNS.recent,
  );

  const hasRequesterIntent =
    containsAnyPhrase(text, INTENT_PATTERNS.requester)
    || solicitante !== undefined;

  const hasResponsibleIntent =
    containsAnyPhrase(text, INTENT_PATTERNS.responsible)
    || responsavel !== undefined;

  const hasOpenIntent = containsAnyPhrase(
    text,
    INTENT_PATTERNS.open,
  );

  const hasExplicitSummary =
    hasStatusSummary
    || hasPrioritySummary;

  const isOsQuestion =
    numero !== undefined
    || hasNamedOsEntity
    || (
      hasOsAcronym
      && !mentionsClient
    )
    || hasExplicitSummary;

  if (!isOsQuestion) {
    return null;
  }

  if (hasHistoryIntent) {
    if (numero === undefined) {
      const asksForAllOs =
        /\btodas?\b/.test(text)
        || /\bgeral\b/.test(text);

      if (asksForAllOs) {
        return createDecision(
          "historico_geral",
          "listar_historico_os",
          entities,
        );
      }

      return createClarification(
        entities,
        "Informe o número da OS para consultar o histórico.",
      );
    }

    return createDecision(
      "consultar_historico",
      "consultar_historico_os",
      entities,
    );
  }

  if (numero !== undefined) {
    return createDecision(
      "buscar_por_numero",
      "buscar_os_por_numero",
      entities,
    );
  }

  if (
    hasStatusSummary
    || (
      hasCountIntent
      && status !== undefined
      && !hasResponsibleIntent
      && !hasRequesterIntent
    )
  ) {
    return createDecision(
      "resumo_por_status",
      "resumo_os_por_status",
      entities,
    );
  }

  if (
    hasPrioritySummary
    || (
      hasCountIntent
      && prioridade !== undefined
      && !hasResponsibleIntent
      && !hasRequesterIntent
    )
  ) {
    return createDecision(
      "resumo_por_prioridade",
      "resumo_os_por_prioridade",
      entities,
    );
  }

  if (hasAverageTimeIntent) {
    return createDecision(
      "tempo_medio_resolucao",
      "tempo_medio_resolucao_os",
      entities,
    );
  }

  if (
    hasCountIntent
    && hasResponsibleIntent
    && responsavel === undefined
  ) {
    return createDecision(
      "resumo_por_responsavel",
      "resumo_os_por_responsavel",
      entities,
    );
  }

  if (
    hasCountIntent
    && hasRequesterIntent
    && solicitante === undefined
  ) {
    return createDecision(
      "resumo_por_solicitante",
      "resumo_os_por_solicitante",
      entities,
    );
  }

  if (hasOverdueIntent) {
    return createDecision(
      "listar_atrasadas",
      "listar_os_atrasadas",
      entities,
    );
  }

  if (
    hasRecentIntent
    && responsavel === undefined
    && solicitante === undefined
  ) {
    return createDecision(
      "listar_recentes",
      "listar_os_recentes",
      entities,
    );
  }

  if (hasRequesterIntent) {
    if (solicitante === undefined) {
      return createClarification(
        entities,
        "Informe o nome do solicitante.",
      );
    }

    return createDecision(
      "listar_por_solicitante",
      "listar_os_por_solicitante",
      entities,
    );
  }

  if (
    hasResponsibleIntent
    && hasOpenIntent
  ) {
    return createDecision(
      "listar_abertas",
      "listar_os_abertas",
      entities,
    );
  }

  if (
    hasResponsibleIntent
    && responsavel !== undefined
  ) {
    return createDecision(
      "listar_por_responsavel",
      "listar_os_por_responsavel",
      entities,
    );
  }

  if (hasResponsibleIntent) {
    return createClarification(
      entities,
      "Informe o nome do responsável.",
    );
  }

  const requestsExactOpenStatus =
    containsPhrase(text, "status aberta")
    || containsPhrase(text, "status aberto");

  if (
    status !== undefined
    && (
      status !== "aberta"
      || requestsExactOpenStatus
    )
  ) {
    return createDecision(
      "listar_por_status",
      "listar_os_por_status",
      entities,
    );
  }

  if (hasOpenIntent) {
    return createDecision(
      "listar_abertas",
      "listar_os_abertas",
      entities,
    );
  }

  if (prioridade !== undefined) {
    return createDecision(
      "listar_por_prioridade",
      "listar_os_por_prioridade",
      entities,
    );
  }

  if (hasCountIntent) {
    return createDecision(
      "resumo_geral",
      "resumo_geral_os",
      entities,
    );
  }

  const hasAllIntent =
    /\btodas?\b/.test(text)
    || /\bqualquer\b/.test(text);

  if (
    hasAllIntent
    && responsavel === undefined
    && solicitante === undefined
  ) {
    return createDecision(
      "listar_recentes",
      "listar_os_recentes",
      entities,
    );
  }

  return createClarification(
    entities,
    "Especifique se deseja consultar a OS por número, status, prioridade, atraso, responsável, solicitante ou histórico.",
  );
}
function validateSchemaValue(value, schema) {
  if (value === null || value === undefined) {
    return false;
  }

  if (
    schema.type === "integer"
    && (
      typeof value !== "number"
      || !Number.isSafeInteger(value)
    )
  ) {
    return false;
  }

  if (
    schema.type === "number"
    && (
      typeof value !== "number"
      || !Number.isFinite(value)
    )
  ) {
    return false;
  }

  if (
    schema.type === "string"
    && typeof value !== "string"
  ) {
    return false;
  }

  if (
    schema.type === "boolean"
    && typeof value !== "boolean"
  ) {
    return false;
  }

  if (
    typeof value === "number"
    && schema.minimum !== undefined
    && value < schema.minimum
  ) {
    return false;
  }

  if (
    typeof value === "number"
    && schema.exclusiveMinimum !== undefined
    && value <= schema.exclusiveMinimum
  ) {
    return false;
  }

  if (
    typeof value === "number"
    && schema.maximum !== undefined
    && value > schema.maximum
  ) {
    return false;
  }

  if (
    typeof value === "number"
    && schema.exclusiveMaximum !== undefined
    && value >= schema.exclusiveMaximum
  ) {
    return false;
  }

  if (
    typeof value === "string"
    && schema.minLength !== undefined
    && value.length < schema.minLength
  ) {
    return false;
  }

  if (
    typeof value === "string"
    && schema.maxLength !== undefined
    && value.length > schema.maxLength
  ) {
    return false;
  }

  if (
    Array.isArray(schema.enum)
    && !schema.enum.includes(value)
  ) {
    return false;
  }

  return true;
}

export function buildToolArguments(
  toolName,
  entities,
  availableTools,
) {
  const tool = availableTools.find(
    (item) => item.function.name === toolName,
  );

  if (!tool) {
    return {
      ok: false,
      args: {},
      errors: [
        {
          field: null,
          code: "tool_not_available",
        },
      ],
    };
  }

  const parameters =
    tool.function.parameters ?? {};

  const properties =
    parameters.properties ?? {};

  const required =
    new Set(parameters.required ?? []);

  const source =
    entities && typeof entities === "object"
      ? entities
      : {};

  const args = {};
  const errors = [];
  const invalidFields = new Set();

  for (const [field, schema] of Object.entries(properties)) {
    if (!Object.hasOwn(source, field)) {
      continue;
    }

    const value = source[field];

    if (!validateSchemaValue(value, schema)) {
      invalidFields.add(field);

      errors.push({
        field,
        code: "invalid_value",
      });

      continue;
    }

    args[field] = value;
  }

  for (const field of required) {
    if (
      !Object.hasOwn(args, field)
      && !invalidFields.has(field)
    ) {
      errors.push({
        field,
        code: "required_field_missing",
      });
    }
  }

  return {
    ok: errors.length === 0,
    args,
    errors,
  };
}
