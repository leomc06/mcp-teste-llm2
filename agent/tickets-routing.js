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

// "resolveu/resolveram <período>" no fim da captura não faz parte do nome
// (ex.: "o pessoal da Infraestrutura Científica resolveu esse mês" → a área
// é só "Infraestrutura Científica").
const TRAILING_RESOLVED_CLAUSE_PATTERN = /\s+resolv(?:eu|eram|ido|ida|idos|idas)\b.*$/iu;

// Conecta uma dimensão (status/área/operador/...) ao pedido de resumo: além
// de "por X", aceita "em cada X", "por cada X", "de cada X" e "cada X" (ex.:
// "quantos tickets existem em cada departamento?").
const DIMENSION_CONNECTOR_SOURCE = "(?:por|em\\s+cada|por\\s+cada|de\\s+cada|cada)";

// "Quais operadores possuem mais tickets?" / "...têm mais chamados?" /
// "...abre mais chamados?" também pede um resumo/ranking, mesmo sem a
// palavra "por" ou "quantos".
const RANKING_CUE_SOURCE = "(?:possu(?:i|em)|tem|abr(?:e|em|iu))\\s+mais";

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

function formatIsoDate(date) {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

// Segunda-feira da semana que contém `date`.
function startOfWeek(date) {
  const resultado = new Date(date);
  const diaSemana = resultado.getDay();
  const deslocamento = diaSemana === 0 ? -6 : 1 - diaSemana;

  resultado.setDate(resultado.getDate() + deslocamento);

  return resultado;
}

// Datas relativas ("essa semana", "hoje", "mês passado" etc.) não têm um
// token de data explícito — calculadas a partir do momento da pergunta.
// `agora` é parametrizável só para permitir teste determinístico.
export function extractRelativeDateRange(text, agora = new Date()) {
  if (/\bhoje\b/.test(text)) {
    const hoje = formatIsoDate(agora);

    return { dataInicio: hoje, dataFim: hoje };
  }

  if (/\bontem\b/.test(text)) {
    const ontem = new Date(agora);
    ontem.setDate(ontem.getDate() - 1);
    const isoOntem = formatIsoDate(ontem);

    return { dataInicio: isoOntem, dataFim: isoOntem };
  }

  if (/\bsemana\s+passada\b/.test(text) || /\bultima\s+semana\b/.test(text)) {
    const segundaAtual = startOfWeek(agora);
    const segundaPassada = new Date(segundaAtual);
    segundaPassada.setDate(segundaPassada.getDate() - 7);
    const sextaPassada = new Date(segundaPassada);
    sextaPassada.setDate(sextaPassada.getDate() + 4);

    return { dataInicio: formatIsoDate(segundaPassada), dataFim: formatIsoDate(sextaPassada) };
  }

  // "Semana de trabalho" = segunda a sexta da semana atual.
  if (/\b(?:essa|esta)\s+semana\b/.test(text)) {
    const segunda = startOfWeek(agora);
    const sexta = new Date(segunda);
    sexta.setDate(sexta.getDate() + 4);

    return { dataInicio: formatIsoDate(segunda), dataFim: formatIsoDate(sexta) };
  }

  if (/\bmes\s+passado\b/.test(text)) {
    const primeiroDiaMesAtual = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const ultimoDiaMesPassado = new Date(primeiroDiaMesAtual);
    ultimoDiaMesPassado.setDate(ultimoDiaMesPassado.getDate() - 1);
    const primeiroDiaMesPassado = new Date(ultimoDiaMesPassado.getFullYear(), ultimoDiaMesPassado.getMonth(), 1);

    return {
      dataInicio: formatIsoDate(primeiroDiaMesPassado),
      dataFim: formatIsoDate(ultimoDiaMesPassado),
    };
  }

  if (/\b(?:esse|este)\s+mes\b/.test(text)) {
    const primeiroDia = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const ultimoDia = new Date(agora.getFullYear(), agora.getMonth() + 1, 0);

    return { dataInicio: formatIsoDate(primeiroDia), dataFim: formatIsoDate(ultimoDia) };
  }

  return undefined;
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
    .replace(/^(?:operador|respons[áa]vel|atendente)\b\s+/iu, "")
    .replace(TRAILING_FILTER_CLAUSE_PATTERN, "")
    .replace(TRAILING_STATE_CLAUSE_PATTERN, "")
    .replace(TRAILING_RESOLVED_CLAUSE_PATTERN, "")
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
    // "o pessoal da/do X" é um jeito comum de gestor se referir a uma área
    // sem usar a palavra "área" — resolveMetaId falha graciosamente se não
    // for um nome de área real, então o risco de falso positivo é baixo.
    /\bpessoal\s+d[ao]\s+(.+)$/iu,
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

// Conectores usados pra pedir busca textual (grep no assunto/descrição do
// ticket): "tickets sobre impressora", "chamados relacionados a rede",
// "chamados que falam de VPN".
const SEARCH_TEXT_CONNECTOR_SOURCE =
  "sobre|relacionad[oa]s?\\s+(?:a|com)|mencionando|contendo|falando\\s+(?:de|sobre)|que\\s+fal(?:a|am|e)\\s+(?:de|sobre)";

export function extractSearchText(value) {
  return extractByPatterns(value, [
    new RegExp(`\\b(?:${SEARCH_TEXT_CONNECTOR_SOURCE})\\s+(.+)$`, "iu"),
  ]);
}

// Nomes de status reais do sistema (confirmados ao vivo via
// listar_status_tickets) reconhecidos sem exigir a palavra "status" na
// frase — é assim que gestores perguntam ("liste os cancelados", "tem
// ticket aguardando aprovação?"). "Fechado"/"encerrado" ficam de fora
// deliberadamente: já são tratados à parte via situação (closure_date, mais
// confiável que confiar no nome do status). "TODOS" é um status-meta da
// API (não corresponde a tickets reais), por isso também fica de fora.
const STATUS_LITERAL_PATTERNS = [
  [/\baguardando\s+atendimento\b/, "Aguardando atendimento"],
  [/\bem\s+andamento\b/, "Em atendimento"],
  [/\bem\s+atendimento\b/, "Em atendimento"],
  [/\bem\s+estudo\b/, "Em estudo"],
  [/\bagendad[oa]s?\s+com\s+(?:o\s+)?usuario\b/, "Agendado com o usuário"],
  [/\bcancelad[oa]s?\b/, "Cancelado"],
  [/\baguardando\s+feedback(?:\s+do\s+usuario)?\b/, "Aguardando feedback do usuário"],
  [/\bindisponivel\s+para\s+atendimento\b/, "Indisponível para atendimento"],
  [/\bencaminhad[oa]s?\s+para\s+(?:o\s+)?operador\b/, "Encaminhado para operador"],
  [/\binterrompid[oa]s?\s+para\s+atender\s+outro\s+chamado\b/, "Interrompido para atender outro chamado"],
  [/\baguardando\s+retorno\s+do\s+fornecedor\b/, "Aguardando retorno do fornecedor"],
  [/\bcom\s+backup\b/, "Com backup"],
  [/\breservad[oa]s?\s+para\s+(?:o\s+)?operador\b/, "Reservado para operador"],
  [/\baguardando\s+aprovacao\b/, "Aguardando aprovação"],
  [/\baguardando\s+rdm\b/, "Aguardando RDM"],
];

export function extractLiteralStatus(text) {
  for (const [pattern, nome] of STATUS_LITERAL_PATTERNS) {
    if (pattern.test(text)) {
      return nome;
    }
  }

  return undefined;
}

export function extractPriorityName(value) {
  return extractByPatterns(value, [
    /\bprioridade\s+(?:de\s+)?(.+)$/iu,
  ]);
}

// "Urgente" é uma prioridade real do sistema (distinta de "Alta"), então a
// palavra solta já é um sinal inequívoco, mesmo sem a palavra "prioridade"
// do lado. Não generalizamos para "alta/média/baixa" soltas: são adjetivos
// comuns demais em português e dariam falso positivo fora do contexto.
export function extractPriorityIntent(value) {
  return extractPriorityName(value) ?? (/\burgente/.test(normalizeText(value)) ? "Urgente" : undefined);
}

export function extractUserName(value) {
  return extractByPatterns(value, [
    /\b(?:busque|busca|procure|procura|encontre|encontra)\s+(?:o\s+|a\s+)?usu[áa]rios?\s+(?:chamados?\s+|de\s+nome\s+)?(.+)$/iu,
    /\busu[áa]rio\s+(?:chamado\s+|de\s+nome\s+)(.+)$/iu,
    /\bquem\s+[ée]\s+(?:o\s+|a\s+)?usu[áa]rio\s+(.+)$/iu,
    /\binforma[çc][õo]es\s+(?:do|sobre\s+o)\s+usu[áa]rio\s+(.+)$/iu,
  ]);
}

// "Fábio está com muito ticket na mão?" / "Fábio tem muitos chamados?" /
// "Fábio está sobrecarregado?" — nome solto antes de uma frase de carga de
// trabalho, sem palavra-marcador como "operador". Alimenta a análise de
// carga por operador (analisar_carga_operador), não um filtro de listagem.
export function extractOperatorWorkloadName(value) {
  return extractByPatterns(value, [
    /^(.+?)\s+(?:esta|está|estao|estão)\s+com\s+muito[s]?\s+(?:ticket|chamado|atendimento)/iu,
    /^(.+?)\s+(?:esta|está|estao|estão)\s+sobrecarregad[oa]s?\b/iu,
    /^(.+?)\s+tem\s+muito[s]?\s+(?:ticket|chamado|atendimento)/iu,
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

  const absoluto = compactEntities({
    dataInicio: inicioMatch ? parseDateToken(inicioMatch[1]) : undefined,
    dataFim: fimMatch ? parseDateToken(fimMatch[1]) : undefined,
  });

  if (absoluto.dataInicio !== undefined || absoluto.dataFim !== undefined) {
    return absoluto;
  }

  return extractRelativeDateRange(normalizeText(value)) ?? {};
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
      /\bliste\s+(?:todas\s+)?as\s+areas\b/,
      /\blistar\s+areas\b/,
      /\bareas\s+existem\b/,
    ],
  },
  {
    tool: "listar_prioridades_tickets",
    patterns: [
      /\bquais\s+prioridades\b/,
      /\bliste\s+(?:todas\s+)?as\s+prioridades\b/,
      /\blistar\s+prioridades\b/,
      /\bprioridades\s+existem\b/,
    ],
  },
  {
    tool: "listar_canais_tickets",
    patterns: [
      /\bquais\s+canais\b/,
      /\bliste\s+(?:todos\s+)?os\s+canais\b/,
      /\blistar\s+canais\b/,
      /\bcanais\s+existem\b/,
      /\bcanais\s+de\s+entrada\b/,
    ],
  },
  {
    tool: "listar_status_tickets",
    patterns: [
      /\bquais\s+status\b/,
      /\bliste\s+(?:todos\s+)?os\s+status\b/,
      /\blistar\s+status\b/,
      /\bstatus\s+existem\b/,
      /\bstatus\s+possiveis\b/,
    ],
  },
  {
    tool: "listar_departamentos_tickets",
    patterns: [
      /\bquais\s+departamentos\b/,
      /\bliste\s+(?:todos\s+)?os\s+departamentos\b/,
      /\blistar\s+departamentos\b/,
      /\bdepartamentos\s+existem\b/,
    ],
  },
  {
    tool: "listar_usuarios_tickets",
    patterns: [
      /\bquais\s+usuarios\b/,
      /\bliste\s+(?:todos\s+)?os\s+usuarios\b/,
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

  const status =
    extractTicketStatusName(pergunta)
    ?? extractLiteralStatus(text);
  const area = extractAreaName(pergunta);
  const departamento = extractDepartmentName(pergunta);
  const operador = extractOperatorName(pergunta);
  const cliente = extractClientName(pergunta);
  const prioridade = extractPriorityIntent(pergunta);
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

  // "ainda não fechado"/"não encerrado"/"não resolveu" significam aberto,
  // mas contêm palavras que indicariam fechado — tratadas à parte, negando
  // isFechadoIntent e alimentando isAbertoIntent. Calculado cedo (antes do
  // bloco de resumos) porque resumo_tickets_por_operador também usa a
  // situação aberto/fechado.
  const NEGATED_CLOSED_SOURCE =
    "nao\\s+(?:esta\\s+|estao\\s+|foi\\s+|foram\\s+)?(?:fechad[oa]s?|encerrad[oa]s?|concluid[oa]s?|finalizad[oa]s?|resolv(?:eu|ido[as]?))";
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
      || /\bresolv(?:eu|ido|ida|idos|idas)\b/.test(text)
    )
    && !isNegatedClosed;

  // Situação só é definida quando a frase menciona aberto/fechado de forma
  // inequívoca — usada tanto no resumo por operador quanto em "mais
  // recentes"; se mencionar as duas, segue sem filtro de situação.
  const situacaoInequivoca =
    isFechadoIntent && !isAbertoIntent
      ? "fechado"
      : isAbertoIntent && !isFechadoIntent
        ? "aberto"
        : undefined;

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
  const mentionsClienteDimension = mentionsDimension(text, "clientes?|solicitantes?");

  // "Quem tem mais chamados...?" já implica ranking por operador nesse
  // domínio, mesmo sem a palavra "operador" (ex.: "...no time"/"na equipe").
  const isOperatorRankingIntent = /\bquem\s+(?:tem|possui|esta\s+com)\s+mais\b/.test(text);

  // Perguntas de "visão geral" da operação — não é uma dimensão específica,
  // é um retrato amplo (total, abertos, fechados, sem operador, congelados,
  // por prioridade, backlog antigo).
  const isDashboardIntent =
    /\bvisao\s+geral\b/.test(text)
    || /\bsituacao\s+geral\b/.test(text)
    || /\bcomo\s+esta\s+a\s+operacao\b/.test(text)
    || /\bcomo\s+estao\s+as\s+coisas\b/.test(text)
    || /\b(?:algo|alguma\s+coisa)\s+preocupante\b/.test(text)
    || /\bmerece\s+(?:minha\s+)?atencao\b/.test(text)
    || /\bsinal\s+de\s+alerta\b/.test(text)
    || /\bdando\s+conta\s+da\s+demanda\b/.test(text)
    || /\btem\s+algum\s+problema\b/.test(text);

  if (isDashboardIntent) {
    return createTicketDecision(
      "resumo_operacional",
      "resumo_operacional_tickets",
      compactEntities({ area, departamento, dataInicio, dataFim }),
    );
  }

  if (hasResumoIntent && mentionsStatusDimension) {
    return createTicketDecision(
      "resumo_por_status",
      "resumo_tickets_por_status",
      compactEntities({ area, departamento, operador, prioridade, limite }),
    );
  }

  if (hasResumoIntent && mentionsPriorityDimension) {
    return createTicketDecision(
      "resumo_por_prioridade",
      "resumo_tickets_por_prioridade",
      compactEntities({ status, area, departamento, operador, limite }),
    );
  }

  if (hasResumoIntent && mentionsAreaDimension) {
    return createTicketDecision(
      "resumo_por_area",
      "resumo_tickets_por_area",
      compactEntities({ status, departamento, operador, prioridade, limite }),
    );
  }

  if (hasResumoIntent && (mentionsOperatorDimension || isOperatorRankingIntent)) {
    return createTicketDecision(
      "resumo_por_operador",
      "resumo_tickets_por_operador",
      compactEntities({ status, area, departamento, prioridade, situacao: situacaoInequivoca, limite }),
    );
  }

  if (hasResumoIntent && mentionsDepartmentDimension) {
    return createTicketDecision(
      "resumo_por_departamento",
      "resumo_tickets_por_departamento",
      compactEntities({ status, area, operador, limite }),
    );
  }

  if (hasResumoIntent && mentionsClienteDimension) {
    return createTicketDecision(
      "resumo_por_cliente",
      "resumo_tickets_por_cliente",
      compactEntities({ status, area, departamento, operador, prioridade, limite }),
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
      compactEntities({ status, area, departamento, operador, prioridade, dataInicio, dataFim, limite, pagina }),
    );
  }

  const textoBusca = extractSearchText(pergunta);

  if (textoBusca !== undefined) {
    return createTicketDecision(
      "buscar_por_texto",
      "buscar_tickets_por_texto",
      compactEntities({
        texto: textoBusca,
        status,
        area,
        departamento,
        operador,
        prioridade,
        situacao: situacaoInequivoca,
        dataInicio,
        dataFim,
        limite,
        pagina,
      }),
    );
  }

  // "Atrasado"/"vencido"/"estourado" não têm dado real de prazo de SLA em
  // lote disponível na API (só por ticket individual, caro demais pra
  // listar todos) — o melhor proxy honesto é o ticket aberto há mais tempo;
  // a resposta mostra "mais antigos", não afirma "atrasado".
  const isOldestOpenIntent =
    /\bmais\s+antig/.test(text)
    || /\bmais\s+velh/.test(text)
    || /\bha\s+mais\s+tempo\b/.test(text)
    || /\batrasad[oa]s?\b/.test(text)
    || /\bvencid[oa]s?\b/.test(text)
    || /\bestourad[oa]s?\b/.test(text);

  if (isOldestOpenIntent) {
    // Ignora o número de "página N" ao procurar um número solto pra usar
    // como limite (ex.: "10 tickets mais antigos, página 2" não pode virar
    // limite: 2).
    const numeroSolto = text.replace(/\bpagina\s+\d+\b/g, "").match(/\b(\d+)\b/);

    return createTicketDecision(
      "listar_abertos_mais_antigos",
      "listar_tickets_abertos_mais_antigos",
      compactEntities({
        area,
        departamento,
        operador: extractOperatorNameForSituacao(pergunta),
        prioridade,
        limite: limite ?? (numeroSolto ? Number(numeroSolto[1]) : undefined),
        pagina,
      }),
    );
  }

  const operadorCarga = extractOperatorWorkloadName(pergunta);

  if (operadorCarga !== undefined) {
    return createTicketDecision(
      "analisar_carga_operador",
      "analisar_carga_operador",
      { operador: operadorCarga },
    );
  }

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
    // Ignora o número de "página N" ao procurar um número solto pra usar
    // como limite (mesmo cuidado do branch de mais antigos).
    const numeroSolto = text.replace(/\bpagina\s+\d+\b/g, "").match(/\b(\d+)\b/);

    return createTicketDecision(
      "listar_mais_recentes",
      "listar_tickets_mais_recentes",
      compactEntities({
        status,
        area,
        departamento,
        operador: extractOperatorNameForSituacao(pergunta),
        prioridade,
        situacao: situacaoInequivoca,
        limite: limite ?? (numeroSolto ? Number(numeroSolto[1]) : undefined),
        pagina,
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
        prioridade,
        dataInicio,
        dataFim,
        limite,
        pagina,
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
        prioridade,
        dataInicio,
        dataFim,
        limite,
        pagina,
      }),
    );
  }

  const isSemOperadorIntent =
    /\bsem\s+(?:operador|responsavel|atendente)\b/.test(text)
    || /\bsem\s+ninguem\b/.test(text)
    || /\bnao\s+(?:foi\s+|foram\s+|esta\s+|estao\s+)?atribuid/.test(text)
    || /\bninguem\s+(?:e\s+)?(?:responsavel|pegando|atendendo|cuidando|resolvendo)\b/.test(text)
    || /\baguardando\s+atribuicao\b/.test(text);

  if (isSemOperadorIntent) {
    return createTicketDecision(
      "listar_sem_operador",
      "listar_tickets_sem_operador",
      compactEntities({ status, area, departamento, prioridade, dataInicio, dataFim, limite, pagina }),
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

  // "Resumo dos tickets da área X" / "do departamento X" / "de prioridade X"
  // pede um resumo, mas menciona a dimensão como FILTRO ("da"/"do/de"), não
  // como conector de agrupamento ("por área") — nenhum dos 6 branches acima
  // bate. Sem isso, cairia na listagem simples e ignoraria a palavra
  // "resumo". Já que nenhuma outra intenção mais específica (congelados,
  // texto, mais antigos/recentes, aberto/fechado, sem operador) bateu antes
  // de chegar aqui, tratamos como pedido de resumo por status (a quebra
  // mais informativa por padrão), filtrado pelo que foi extraído — exceto
  // quando o único filtro extraído já é o próprio status (nesse caso
  // agrupar por status seria degenerado, então agrupamos por área).
  if (hasResumoIntent && (area || departamento || prioridade || status)) {
    if (!area && !departamento && !prioridade && status) {
      return createTicketDecision(
        "resumo_por_area",
        "resumo_tickets_por_area",
        compactEntities({ status, departamento, operador, prioridade, limite }),
      );
    }

    return createTicketDecision(
      "resumo_por_status",
      "resumo_tickets_por_status",
      compactEntities({ area, departamento, operador, prioridade, limite }),
    );
  }

  return createTicketDecision(
    "listar",
    "listar_tickets",
    entities,
  );
}
