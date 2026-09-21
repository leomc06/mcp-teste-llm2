import {
  compactEntities,
  extractLimit,
  normalizeText,
} from "./routing-utils.js";

// "está"/"esta" (singular) ou "estão"/"estao" (plural) — atenção: o plural
// usa "ã" (til), não "á" (agudo), são letras diferentes.
const ESTAR_SOURCE = "est(?:[áa]|[ãa]o)";

// "sem" entra na lista de conectores (junto de com/e/que/do/da/no/na) pra
// cobrir "área Suporte SEM operador" — antes só "com/tem/está X" era podado,
// então "sem X" vazava inteiro pro nome capturado (ex.: area: "Suporte sem
// operador").
const TRAILING_FILTER_CLAUSE_PATTERN = new RegExp(
  `\\s+(?:(?:tem|possui|${ESTAR_SOURCE})\\s+)?(?:com|sem|e|que\\s+(?:tem|${ESTAR_SOURCE})|d[oa]|n[oa])\\s+(?:o\\s+|a\\s+)?(?:status|prioridade|[áa]rea|departamento|operador|respons[áa]vel|atendente|cliente|limite)\\b.*$`,
  "iu",
);

const TRAILING_PAGE_CLAUSE_PATTERN =
  /\s*\(?\s*p[áa]gina\s+\d+\)?\s*$/iu;

// Verbo solto no fim da captura, sem cláusula depois (ex.: "...o operador
// Cesar tem?" → o "tem" sobra porque não há um "no/na/do/da <dimensão>"
// depois dele para o corte acima remover junto). "no total"/"ao todo" depois
// do verbo (ex.: "a área Suporte tem no total?") também não faz parte do
// nome — sem isso, "Suporte tem no total" vazava inteiro pro filtro de área.
// "teve"/"tiveram" (passado de "ter") e "possuiu"/"possuíram" (passado de
// "possuir") são a mesma ideia em outro tempo verbal (ex.: "a área WEB teve
// no mês de agosto?") — sem eles, só a forma no presente era podada.
const BARE_HAVE_VERB_SOURCE =
  `(?:tem|teve|tiveram|possui|possuiu|possu[íi]ram|${ESTAR_SOURCE})`;
const TRAILING_BARE_VERB_PATTERN = new RegExp(
  `\\s+${BARE_HAVE_VERB_SOURCE}(?:\\s+(?:no\\s+total|ao\\s+todo))?\\s*$`,
  "iu",
);

// "está(m) <situação do ticket>" no fim da frase não faz parte do nome
// capturado (ex.: "departamento COIDS estão com o SLA pausado", "área X
// estão abertos há mais tempo") — corta tudo a partir de "está(m)". "que"
// opcional antes do verbo (achado ao corrigir o P5 da auditoria end-to-end:
// "tickets do João QUE ESTÃO aguardando atendimento" capturava operador:
// "João que", porque o "que" antes de "estão" não era coberto) — mesma
// ideia do "no/na" opcional já usado antes da data relativa. "foram"/"foi"
// como alternativa a está/estão, com "ainda"/"não"/"já" opcionais antes
// (achado testando o lote de perguntas ao vivo): "...do Ivan Márcio Barbosa
// QUE AINDA NÃO FORAM RESOLVIDOS" capturava operador: "Ivan Márcio Barbosa
// que ainda não foram", porque só está/estão eram cobertos, não foi/foram.
const TRAILING_STATE_CLAUSE_PATTERN = new RegExp(
  `\\s+(?:que\\s+)?(?:ainda\\s+)?(?:n[ãa]o\\s+)?(?:j[áa]\\s+)?(?:${ESTAR_SOURCE}|foram|foi)\\s+.+$`,
  "iu",
);

// Achado extra descoberto testando o item 10 (mesma causa raiz do item 1):
// o adjetivo de situação "aberto"/"pendente"/"congelado"/"travado"/
// "paralisado" SOLTO no fim (sem verbo "está"/"estão" antes, ex.: "área
// Suporte abertos", "cliente Acme congelados") não era removido — o
// equivalente pra "fechado" já funcionava (TRAILING_RESOLVED_CLAUSE_PATTERN
// reaproveita CLOSURE_VERB_SOURCE, que já cobre a forma adjetiva "fechados"
// etc.), mas não havia um pattern irmão pra esse vocabulário.
const OPEN_STATE_ADJECTIVE_SOURCE =
  "(?:abert[oa]s?|pendentes?|congelad[oa]s?|travad[oa]s?|paralisad[oa]s?)";
const TRAILING_OPEN_STATE_CLAUSE_PATTERN = new RegExp(`\\s+${OPEN_STATE_ADJECTIVE_SOURCE}\\b.*$`, "iu");

// Vocabulário de "fechado" em toda forma verbal (3ª pessoa do singular/
// plural no passado) e adjetiva (singular/plural) dos 6 sinônimos aceitos —
// um único lugar pra declarar isso evita o que já aconteceu duas vezes
// nesta sessão: um sinônimo ganhar a forma adjetiva ("encerrados") mas não a
// verbal ("encerrou"), ou vice-versa, em só um dos usos (detecção de
// intenção, negação, ou corte de cláusula final ao extrair nomes).
// "solucionado/solucionou" (item 5 do plano de correção) é sinônimo comum de
// "resolvido" que faltava.
const CLOSURE_VERB_SOURCE =
  "(?:fech(?:ad[oa]s?|ou|aram)"
  + "|encerr(?:ad[oa]s?|ou|aram)"
  + "|conclu(?:[íi]d[oa]s?|iu|[íi]ram)"
  + "|finaliz(?:ad[oa]s?|ou|aram)"
  + "|resolv(?:id[oa]s?|eu|eram)"
  + "|solucion(?:ad[oa]s?|ou|aram))";

// "fechou/encerrou/concluiu/finalizou/resolveu <período>" no fim da captura
// não faz parte do nome (ex.: "o pessoal da Infraestrutura Científica
// resolveu esse mês" → a área é só "Infraestrutura Científica"; "a área WEB
// concluiu quantos chamados" → só "WEB").
const TRAILING_RESOLVED_CLAUSE_PATTERN = new RegExp(`\\s+${CLOSURE_VERB_SOURCE}\\b.*$`, "iu");

// Mesma ideia do padrão acima, mas pro verbo de CRIAÇÃO (voz passiva "foi/
// foram aberto(s)"), não de fechamento — reaproveitado também por
// isCreationPassive mais abaixo, pra não duplicar o vocabulário em 2
// lugares. Ex.: "tickets urgentes da categoria Suporte foram abertos este
// mês" → a área é só "Suporte".
const CREATION_VERB_SOURCE = "(?:foi|foram)\\s+abert[oa]s?";
const TRAILING_CREATION_CLAUSE_PATTERN = new RegExp(`\\s+${CREATION_VERB_SOURCE}\\b.*$`, "iu");

// "criado(s)/criada(s) por/pelo/pela <agente>" (voz ativa, identifica QUEM
// criou, diferente de CREATION_VERB_SOURCE acima que é sobre QUANDO) no fim
// da captura não faz parte do nome — quem criou já é extraído à parte por
// extractOperatorName (ex.: "tickets com prioridade alta criados pelo
// operador Cesar" → a prioridade é só "alta").
const TRAILING_CREATED_BY_CLAUSE_PATTERN = /\s+criad[oa]s?\s+(?:por|pel[oa])\s+.+$/iu;

// Vocabulário de "atrasado" (proxy de mais-antigo — a API não tem dado real
// de prazo de SLA em lote, ver isOldestOpenIntent mais abaixo) em forma
// adjetiva e verbal — mesmo cuidado do CLOSURE_VERB_SOURCE acima, 1 lugar só
// pra não repetir o bug de um sinônimo ganhar só 1 das 2 formas. Também
// reaproveitado pelo detector de negação (item 3) pra reconhecer "não estão
// atrasados"/"não passou do prazo" como negação de um estado, não só de uma
// palavra solta. "fora do prazo"/"passou do prazo"/"venceu" (item 5) eram os
// sinônimos que o próprio usuário citou no pedido original e que faltavam.
const OLDEST_PROXY_STATE_SOURCE =
  "(?:atrasad[oa]s?"
  + "|vencid[oa]s?"
  + "|estourad[oa]s?"
  + "|venc(?:eu|eram)"
  + "|fora\\s+do\\s+prazo"
  + "|pass(?:ou|aram)\\s+do\\s+prazo)";

// Conecta uma dimensão (status/área/operador/...) ao pedido de resumo: além
// de "por X", aceita "em cada X", "por cada X", "de cada X" e "cada X" (ex.:
// "quantos tickets existem em cada departamento?").
const DIMENSION_CONNECTOR_SOURCE = "(?:por|em\\s+cada|por\\s+cada|de\\s+cada|cada)";

// "Quais operadores possuem mais tickets?" / "...têm mais chamados?" /
// "...abre mais chamados?" / "área/operador COM mais tickets" / "qual
// cliente MAIS abriu chamados" (ordem invertida, comum em português pra dar
// ênfase) também pedem um resumo/ranking, mesmo sem a palavra "por" ou
// "quantos". O "(?!\s+de\b)" depois de "mais"/"menos" evita casar "com mais
// de 30 dias" (limiar de idade, não ranking) com a mesma regra de "com
// mais". "menos" (o oposto de "mais") também aciona o resumo/ranking — a
// tool sempre devolve a lista completa ordenada do maior pro menor, então
// "quem tem menos" é respondido lendo o fim da lista; só não vale combinar
// isso com um "top N" numérico (nesse caso o corte pegaria os N maiores, não
// os N menores — limitação conhecida, não implementada).
const RANKING_CUE_SOURCE =
  "(?:(?:possu(?:i|em)|tem|abr(?:e|em|iu)|com)\\s+(?:mais|menos)(?!\\s+de\\b)"
  + "|(?:mais|menos)\\s+(?:possu(?:i|em)|tem|abr(?:e|em|iu)))";

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

// Mesmas chaves de MONTH_NUMBERS, sem acento — usado pra reconhecer "no mês
// de agosto"/"em agosto" (nome do mês solto, sem dia nem ano) no texto já
// normalizado (sem acento) que extractRelativeDateRange recebe.
const NORMALIZED_MONTH_NAME_SOURCE = Object.keys(MONTH_NUMBERS).join("|");

// Data por extenso, ex.: "dia 2 de agosto de 2026" ou "2 de agosto de 2026".
const LONG_DATE_SOURCE =
  `(?:dia\\s+)?\\d{1,2}\\s+de\\s+(?:${MONTH_NAME_SOURCE})\\s+de\\s+\\d{4}`;

// Data no formato brasileiro DD/MM/AAAA (achado testando o lote de perguntas
// ao vivo — Img 5): "entre 01/07/2026 e 31/07/2026" não batia em nenhum
// formato aceito (só ISO ou por extenso), então o intervalo inteiro vazava
// pro nome da entidade capturada (ex.: área "WEB teve entre 01/07/2026 e
// 31/07/2026"). Assume DD/MM (dia primeiro), o formato padrão em pt-BR — não
// há como distinguir de MM/DD sem contexto adicional, mas essa é a leitura
// natural de quem escreve em português.
const BR_DATE_SOURCE = "\\d{1,2}/\\d{1,2}/\\d{4}";

// Qualquer formato de data aceito (ISO, por extenso ou BR), como um único
// token.
const DATE_TOKEN_SOURCE = `(?:${ISO_DATE_SOURCE}|${LONG_DATE_SOURCE}|${BR_DATE_SOURCE})`;

// Normaliza um token de data (ISO, por extenso ou BR) para "AAAA-MM-DD".
function parseDateToken(token) {
  const texto = token.trim();

  if (new RegExp(`^${ISO_DATE_SOURCE}$`).test(texto)) {
    return texto;
  }

  const brMatch = texto.match(new RegExp(`^(\\d{1,2})/(\\d{1,2})/(\\d{4})$`));

  if (brMatch) {
    const dia = brMatch[1].padStart(2, "0");
    const mes = brMatch[2].padStart(2, "0");
    const ano = brMatch[3];

    return `${ano}-${mes}-${dia}`;
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

  // "amanhã" (achado P4 da auditoria end-to-end): antes não tinha nenhum
  // padrão pra essa data relativa, então o filtro simplesmente desaparecia
  // em silêncio ("tickets abertos amanhã" virava "tickets abertos", sem
  // filtro de data nenhum) — confirmado ao vivo com um resultado
  // logicamente impossível (tickets "abertos amanhã" sendo uma data futura).
  if (/\bamanha\b/.test(text)) {
    const amanha = new Date(agora);
    amanha.setDate(amanha.getDate() + 1);
    const isoAmanha = formatIsoDate(amanha);

    return { dataInicio: isoAmanha, dataFim: isoAmanha };
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

  if (/\bano\s+passado\b/.test(text)) {
    const anoPassado = agora.getFullYear() - 1;

    return {
      dataInicio: formatIsoDate(new Date(anoPassado, 0, 1)),
      dataFim: formatIsoDate(new Date(anoPassado, 11, 31)),
    };
  }

  if (/\b(?:esse|este)\s+ano\b/.test(text)) {
    const anoAtual = agora.getFullYear();

    return {
      dataInicio: formatIsoDate(new Date(anoAtual, 0, 1)),
      dataFim: formatIsoDate(new Date(anoAtual, 11, 31)),
    };
  }

  // "entre agosto e setembro" — intervalo de 2 meses soltos, sem dia nem
  // ano (diferente de TRAILING_DATE_CLAUSE_PATTERN/extractDateRange, que só
  // cobre "entre X e Y" com data completa). Assume o ano corrente pros dois
  // meses — não cobre o caso de o intervalo atravessar a virada do ano
  // (ex.: "entre novembro e fevereiro").
  const intervaloMesesMatch = text.match(
    new RegExp(
      `\\bentre\\s+(${NORMALIZED_MONTH_NAME_SOURCE})\\s+e\\s+(${NORMALIZED_MONTH_NAME_SOURCE})\\b`,
      "iu",
    ),
  );

  if (intervaloMesesMatch) {
    const mesInicio = Number(MONTH_NUMBERS[intervaloMesesMatch[1].toLowerCase()]);
    const mesFim = Number(MONTH_NUMBERS[intervaloMesesMatch[2].toLowerCase()]);
    const ano = agora.getFullYear();

    return {
      dataInicio: formatIsoDate(new Date(ano, mesInicio - 1, 1)),
      dataFim: formatIsoDate(new Date(ano, mesFim, 0)),
    };
  }

  // "desde agosto"/"a partir de agosto" — mês nomeado sozinho como início de
  // um intervalo aberto (sem data final, assume até hoje), sem dia nem ano.
  // Diferente do "desde <data completa>" que extractDateRange já cobre —
  // achado testando o lote de perguntas ao vivo: "Qual cliente mais abriu
  // chamados na área WEB DESDE JANEIRO?" não extraía data nenhuma (nem essa
  // nem a de "no mês de"/"em" abaixo, que exigem outro conector), então o
  // "desde janeiro" inteiro vazava pro nome da área.
  const desdeMesNomeadoMatch = text.match(
    new RegExp(`\\b(?:desde|a\\s+partir\\s+de)\\s+(${NORMALIZED_MONTH_NAME_SOURCE})\\b`, "iu"),
  );

  if (desdeMesNomeadoMatch) {
    const mes = Number(MONTH_NUMBERS[desdeMesNomeadoMatch[1].toLowerCase()]);
    const ano = agora.getFullYear();

    return {
      dataInicio: formatIsoDate(new Date(ano, mes - 1, 1)),
      dataFim: formatIsoDate(agora),
    };
  }

  // "no mês de agosto"/"em agosto" — nome do mês solto, sem dia nem ano.
  // Diferente de LONG_DATE_SOURCE (que exige "de <mês> de <ano>" completo),
  // aqui assume-se o ano corrente, já que é assim que a maioria das
  // perguntas do dia a dia se refere a um mês sem querer dizer um ano
  // específico.
  const mesNomeadoMatch = text.match(
    new RegExp(`\\b(?:no\\s+mes\\s+de|em)\\s+(${NORMALIZED_MONTH_NAME_SOURCE})\\b`, "iu"),
  );

  if (mesNomeadoMatch) {
    const mes = Number(MONTH_NUMBERS[mesNomeadoMatch[1].toLowerCase()]);
    const ano = agora.getFullYear();

    return {
      dataInicio: formatIsoDate(new Date(ano, mes - 1, 1)),
      dataFim: formatIsoDate(new Date(ano, mes, 0)),
    };
  }

  // "há mais de N dias/semanas/meses/anos" — período relativo EM ABERTO
  // (só teto na data de abertura, sem piso): tickets abertos antes desse
  // ponto no tempo. Achado testando o lote de perguntas ao vivo (Img 31):
  // "tickets abertos há mais de 6 meses" não tinha suporte nenhum, o
  // período inteiro era ignorado em silêncio.
  // "mês" pluraliza irregular ("meses", não "mes" + "s"), por isso a
  // unidade lista as duas formas de cada uma por extenso em vez de um
  // radical + "s?" só (bug achado testando esta própria correção: "6
  // meses" não batia com "mes" + s? opcional, porque sobra um "e" entre os
  // dois "s").
  const haMaisDeMatch = text.match(/\bha\s+mais\s+de\s+(\d+)\s+(dias?|semanas?|mes|meses|anos?)\b/iu);

  if (haMaisDeMatch) {
    const quantidade = Number(haMaisDeMatch[1]);
    const unidade = haMaisDeMatch[2].toLowerCase();
    const limite = new Date(agora);

    if (unidade.startsWith("dia")) {
      limite.setDate(limite.getDate() - quantidade);
    } else if (unidade.startsWith("semana")) {
      limite.setDate(limite.getDate() - quantidade * 7);
    } else if (unidade.startsWith("mes")) {
      limite.setMonth(limite.getMonth() - quantidade);
    } else {
      limite.setFullYear(limite.getFullYear() - quantidade);
    }

    return { dataFim: formatIsoDate(limite) };
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

// Mesmos períodos relativos que extractRelativeDateRange reconhece (hoje/
// ontem/essa semana/semana passada/esse mês/mês passado/esse ano/ano
// passado) — sem isso, "departamento Governança ESSA SEMANA" vazava a
// cláusula de data inteira pro nome capturado (departamento: "Governança
// essa semana"). TRAILING_DATE_CLAUSE_PATTERN acima só cobre data ABSOLUTA
// ("entre X e Y"/"desde X"/"até X"), por isso é um padrão à parte.
// "no"/"na" opcional antes da fase relativa (ex.: "departamento Coids teve
// NO mês passado") — sem isso, o corte deixava o "no" órfão colado no nome
// capturado (departamento: "Coids teve no").
const TRAILING_RELATIVE_DATE_CLAUSE_PATTERN = new RegExp(
  "\\s+(?:n[oa]\\s+)?(?:hoje|ontem|amanh[ãa]"
    + "|(?:ess[ae]|est[ae])\\s+semana|semana\\s+passada|[úu]ltima\\s+semana"
    + "|(?:esse|este)\\s+m[êe]s|m[êe]s\\s+passado"
    + "|(?:esse|este)\\s+ano|ano\\s+passado)\\b.*$",
  "iu",
);

// "no mês de agosto"/"em agosto" (nome do mês solto) no fim da captura
// também não faz parte do nome — mesmo raciocínio do padrão acima, mas pro
// mês nomeado que extractRelativeDateRange passou a reconhecer.
const TRAILING_NAMED_MONTH_CLAUSE_PATTERN = new RegExp(
  `\\s+(?:no\\s+m[êe]s\\s+de|em)\\s+(?:${MONTH_NAME_SOURCE})\\b.*$`,
  "iu",
);

// "desde agosto"/"a partir de agosto" (mês nomeado solto, sem data
// completa) — mesma ideia do padrão acima, pro intervalo aberto que
// extractRelativeDateRange também passou a reconhecer.
const TRAILING_NAMED_MONTH_SINCE_CLAUSE_PATTERN = new RegExp(
  `\\s+(?:desde|a\\s+partir\\s+de)\\s+(?:${MONTH_NAME_SOURCE})\\b.*$`,
  "iu",
);

// "há mais de N dias/semanas/meses/anos" (Img 31) — mesma ideia, pro
// período relativo em aberto que extractRelativeDateRange também passou a
// reconhecer.
const TRAILING_HA_MAIS_DE_CLAUSE_PATTERN =
  /\s+h[áa]\s+mais\s+de\s+\d+\s+(?:dias?|semanas?|mes|meses|anos?)\b.*$/iu;

// "entre agosto e setembro" (intervalo de 2 meses soltos) — mesma ideia,
// pro intervalo de meses que extractRelativeDateRange também reconhece.
const TRAILING_NAMED_MONTH_RANGE_CLAUSE_PATTERN = new RegExp(
  `\\s+entre\\s+(?:${MONTH_NAME_SOURCE})\\s+e\\s+(?:${MONTH_NAME_SOURCE})\\b.*$`,
  "iu",
);

// Achado testando o lote de perguntas ao vivo (Img 35): 'Existe algum
// chamado duplicado sobre "LED DE ALERTA"?' capturava texto: '"LED DE
// ALERTA"' com as aspas literais dentro — a API de tickets provavelmente
// faz match por substring contra o texto real do ticket, que não tem aspas
// nenhuma, então a busca nunca batia com nada. Remove aspas (retas e
// tipográficas) de qualquer entidade de texto livre capturada, não só busca
// por texto — o mesmo problema valeria pra um nome de área/operador/cliente
// entre aspas.
const QUOTE_CHARACTERS_PATTERN = /["'“”‘’„‟‹›«»]/gu;

// "abre muito(s) chamado(s)/ticket(s)/atendimento(s)" no fim da captura não
// faz parte do nome (achado testando o lote de perguntas ao vivo — Img 7):
// "cliente Amanda Carolina ABRE MUITOS CHAMADOS?" capturava cliente: "Amanda
// Carolina abre muitos chamados" inteiro, que nunca batia por substring com
// nenhum contact_name real.
const CLIENT_ACTIVITY_VERB_SOURCE = "(?:abre|abrem|abriu|abriram)";
const TRAILING_CLIENT_ACTIVITY_CLAUSE_PATTERN = new RegExp(
  `\\s+${CLIENT_ACTIVITY_VERB_SOURCE}\\s+muito[s]?\\s+(?:tickets?|chamados?|atendimentos?)\\b.*$`,
  "iu",
);

function cleanFreeText(value) {
  const text = String(value ?? "")
    .split(/[,.!?;:]/u, 1)[0]
    .trim()
    .replace(QUOTE_CHARACTERS_PATTERN, "")
    .trim()
    .replace(/^(?:o|a|os|as|de|do|da)\b\s+/iu, "")
    .replace(/^(?:operador|respons[áa]vel|atendente)\b\s+/iu, "")
    .replace(TRAILING_FILTER_CLAUSE_PATTERN, "")
    .replace(TRAILING_STATE_CLAUSE_PATTERN, "")
    .replace(TRAILING_RESOLVED_CLAUSE_PATTERN, "")
    .replace(TRAILING_CREATION_CLAUSE_PATTERN, "")
    // Depois de TRAILING_CREATION_CLAUSE_PATTERN de propósito: "foram
    // abertos" precisa ser podado inteiro primeiro (pattern mais
    // específico), senão esse pattern (mais genérico, "abertos" solto)
    // comeria só o "abertos" e deixaria o "foram" órfão pra trás.
    .replace(TRAILING_OPEN_STATE_CLAUSE_PATTERN, "")
    .replace(TRAILING_CREATED_BY_CLAUSE_PATTERN, "")
    .replace(TRAILING_CLIENT_ACTIVITY_CLAUSE_PATTERN, "")
    .replace(TRAILING_DATE_CLAUSE_PATTERN, "")
    .replace(TRAILING_RELATIVE_DATE_CLAUSE_PATTERN, "")
    .replace(TRAILING_NAMED_MONTH_RANGE_CLAUSE_PATTERN, "")
    .replace(TRAILING_NAMED_MONTH_SINCE_CLAUSE_PATTERN, "")
    .replace(TRAILING_HA_MAIS_DE_CLAUSE_PATTERN, "")
    .replace(TRAILING_NAMED_MONTH_CLAUSE_PATTERN, "")
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

// Mesmo vocabulário acima, mas aceitando plural — "solicitação" tem plural
// irregular ("solicitações" normaliza pra "solicitacoes", não
// "solicitacaos"), por isso entra como alternativa própria em vez de só
// anexar "s?" no grupo inteiro. Usado pelo guard de contexto de
// isFechadoIntent (item 7 do plano de correção) — ver mais abaixo.
const TICKET_CONTEXT_SOURCE = `(?:${TICKET_NOUN_SOURCE}s?|solicitacoes)`;

// Vocabulário mínimo que indica que a pergunta é sobre o domínio de tickets,
// mesmo quando nenhuma entidade foi extraída com sucesso — usado só no
// catch-all final de routeTicketQuestion (achado P1 da auditoria end-to-end:
// "qual é a previsão do tempo?" e outras perguntas sem relação nenhuma com
// tickets caíam silenciosamente em listar_tickets sem filtro, devolvendo uma
// listagem como se fosse resposta válida). Reaproveita os vocabulários já
// declarados acima (fechado/aberto/vencido) em vez de duplicar sinônimos.
const TICKET_DOMAIN_VOCABULARY_PATTERN = new RegExp(
  `\\b(?:${TICKET_CONTEXT_SOURCE}|resumo|historico|status|prioridade|urgente`
    + `|critic[oa]s?|area|departamento|operador|responsavel|atendente|cliente`
    + `|pendente|${CLOSURE_VERB_SOURCE}|${OPEN_STATE_ADJECTIVE_SOURCE}|${OLDEST_PROXY_STATE_SOURCE})\\b`,
  "u",
);

export function extractTicketNumber(value) {
  const text = normalizeText(value);

  const patterns = [
    new RegExp(`\\b${TICKET_NOUN_SOURCE}\\s+(?:numero\\s+)?(\\d+)\\b`),
    new RegExp(`\\bnumero\\s+(?:do\\s+)?(?:${TICKET_NOUN_SOURCE}\\s+)?(\\d+)\\b`),
    /\bn[°º]\s*(\d+)\b/,
    // Número sozinho, sem nenhuma outra palavra (ex.: "1002") — jeito comum
    // de perguntar por um ticket específico sem dizer "ticket"/"número"
    // (achado P3 da auditoria end-to-end: antes caía no fallback
    // listar_tickets, ignorando o número). Só bate quando o texto INTEIRO é
    // o número, pra não confundir com um número solto dentro de uma frase
    // maior sobre outra coisa (ex.: "limite 5", "página 2").
    /^(\d+)$/,
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

// "Compare o ticket X com o ticket Y" / "diferença entre os tickets X e Y" —
// dois números de ticket na mesma pergunta com um conector de comparação.
// Só ativa quando há de fato um conector de comparação (não é só "atualize
// o 100 e o 200", por exemplo).
const COMPARE_CONNECTOR_SOURCE = "compar[ae]|diferen[cç]a\\s+entre";

export function extractTicketComparisonNumbers(value) {
  const text = normalizeText(value);

  if (!new RegExp(`\\b(?:${COMPARE_CONNECTOR_SOURCE})\\b`).test(text)) {
    return undefined;
  }

  // O substantivo (ticket/chamado/...) geralmente aparece uma vez só pra
  // valer pros dois números ("compare os tickets 50 e 75"), não repetido
  // antes de cada um — por isso não exige o substantivo colado em cada
  // número, só que ele apareça em algum lugar da frase.
  if (!new RegExp(`\\b(?:${TICKET_NOUN_SOURCE}s?|numero)\\b`).test(text)) {
    return undefined;
  }

  const numeros = [...text.matchAll(/\b(\d+)\b/g)]
    .map((match) => Number(match[1]))
    .filter((numero) => Number.isSafeInteger(numero) && numero > 0 && numero <= 2147483647);

  return numeros.length >= 2 ? [numeros[0], numeros[1]] : undefined;
}

// "(?!(?:mais|menos)\b)" no início da captura evita que perguntas de ranking
// com "mais"/"menos" invertido ("qual área MAIS tem tickets", "cliente que
// MAIS abriu chamados", "operador com MENOS tickets") sejam lidas como um
// nome de filtro literal ("área 'mais tem tickets'") — nenhum nome real de
// área/departamento/operador/cliente começa com "mais" ou "menos".
export function extractAreaName(value) {
  return extractByPatterns(value, [
    // "categoria" é sinônimo comum de "área" fora do vocabulário interno do
    // sistema (quem pergunta não necessariamente sabe que a API chama isso
    // de "área") — resolveMetaId falha graciosamente se não for um nome de
    // área real, então o risco de falso positivo é baixo.
    /(?<![\p{L}\p{N}])(?:[áa]rea|categoria)\s+(?:de\s+)?(?!(?:mais|menos)\b)(.+)$/iu,
    // "o pessoal da/do X" é um jeito comum de gestor se referir a uma área
    // sem usar a palavra "área" — mesmo raciocínio acima.
    /\bpessoal\s+d[ao]\s+(?!(?:mais|menos)\b)(.+)$/iu,
  ]);
}

export function extractDepartmentName(value) {
  return extractByPatterns(value, [
    /\bdepartamento\s+(?:de\s+)?(?!(?:mais|menos)\b)(.+)$/iu,
  ]);
}

// "por" também introduz fórmulas de cortesia/discurso em português ("por
// favor", "por gentileza") e conectivos que não têm nada a ver com "feito
// por alguém" ("por último", "por enquanto", "por exemplo") — confirmado ao
// vivo: "Liste os tickets abertos por favor" produzia operador: "favor".
// "usuário" (regressão achada testando o fix do item P5 da auditoria
// end-to-end): "aguardando feedback DO USUÁRIO" é parte do nome literal de
// um status, não uma referência a um operador chamado "usuário" — sem essa
// exclusão, "Quantos tickets estão aguardando feedback do usuário?"
// capturava operador: "usuário" (inexistente), fazendo a consulta não
// encontrar nada. Não afeta "tickets do usuário Carlos" (aí quem casa
// primeiro é o padrão explícito "usuário <nome>", não este).
// "fornecedor" (de "aguardando retorno DO FORNECEDOR", outro nome literal de
// status) e "prazo" (de "fora DO PRAZO"/"passou DO PRAZO", vocabulário de
// SLA vencido) são a mesma regressão do "usuário" acima — varredura
// completa do arquivo por "do/da <palavra>" feita depois de achar o bug do
// "usuário" pra não deixar mais casos iguais escondidos.
// Lista única de palavras de domínio, compartilhada pelos padrões "por/pelo"
// e "do/da" — "cliente"/"sistema"/"mês"/"ano"/"semana"/"período"/"total"
// também vazavam via "por" (achado testando "Quantos tickets por cliente?" →
// operador: "cliente" de brinde, corrompendo o filtro de resumo_por_cliente)
// e não só via "do/da", então não faz sentido as duas listas divergirem:
// se uma palavra é arriscada demais pra um conector possessivo, é arriscada
// do mesmo jeito pro outro. resolveMetaId continua sendo a rede de segurança
// final: um valor capturado errado só falha como "não encontrado", não
// aplica um filtro errado silenciosamente.
// "ninguém" (achado testando o lote de perguntas ao vivo — Img 8): "tickets
// que ainda não foram atendidos POR NINGUÉM" capturava operador: "ninguém"
// (um nome inventado), e o detector de negação via ("não" antes desse valor)
// concluía (errado) que era uma exclusão não suportada — a pergunta real é
// "sem operador" (isSemOperadorIntent, já suportado), só numa ordem de
// frase ("verbo + por ninguém") que esse detector ainda não cobria.
const OPERATOR_BY_EXCLUSION_SOURCE =
  "status\\b|prioridade\\b|[áa]rea\\b|categoria\\b|departamento\\b|cliente\\b|operador\\b|p[áa]gina\\b|usu[áa]rio\\b"
  + "|fornecedor\\b|prazo\\b"
  + "|favor\\b|gentileza\\b|[úu]ltimo\\b|[úu]ltima\\b|enquanto\\b|exemplo\\b"
  + "|sistema\\b|m[êe]s\\b|ano\\b|semana\\b|per[íi]odo\\b|total\\b|limite\\b|ningu[ée]m\\b";

const OPERATOR_DO_DA_EXCLUSION_SOURCE = OPERATOR_BY_EXCLUSION_SOURCE;

// Achado P5 da auditoria end-to-end: as variantes "por/pelo X" e "do/da X"
// (antes só na extração usada pelas tools de situação — aberto/fechado/
// congelado/vencido/mais-antigos/mais-recentes) não estavam ligadas a esta
// extração genérica, usada por listar_tickets e por qualquer pergunta de
// status arbitrário sem branch dedicado — confirmado ao vivo: "Mostre os
// tickets do João que estão aguardando atendimento" perdia o "João" por
// completo. Unificado aqui numa função só, em vez de manter 2 versões da
// mesma extração em paralelo (era exatamente esse tipo de duplicação que
// deixou o fix anterior — "do/da X" — cobrindo só uma das duas).
// Exclusão usada tanto aqui (padrão "quantos tickets <nome> tem", achado do
// bug de "Quantos tickets o Fábio Gali tem em aberto?" perder o operador)
// quanto em extractOperatorWorkloadName mais abaixo (mesma ideia, pra
// "carga do operador") — evita capturar "a área Suporte"/"o departamento
// Governança"/etc. como se fosse nome de operador. Reaproveita a mesma lista
// unificada de OPERATOR_BY_EXCLUSION_SOURCE (+ "responsável"/"atendente",
// que só fazem sentido aqui) em vez de manter uma terceira lista divergente
// — achado ao vivo testando a mesma classe de bug: "Quantos tickets o
// sistema/mês/fornecedor/usuário tem?" todos roteavam pra
// analisar_carga_operador com um "operador" inventado, porque essa lista
// nunca tinha ganhado as palavras já excluídas nas outras duas.
const OPERATOR_WORKLOAD_EXCLUSION_SOURCE =
  `${OPERATOR_BY_EXCLUSION_SOURCE}|respons[áa]vel\\b|atendente\\b`;

// "tratou"/"atendeu" (achado testando o lote de perguntas ao vivo — Img 13):
// "Quantos tickets o Fábio Moreira TRATOU...?" não capturava o operador,
// porque só "tem" fechava esse padrão — o nome inteiro se perdia, mesmo
// antes de qualquer problema de negação na cláusula seguinte.
const OPERATOR_WORKLOAD_VERB_SOURCE = "(?:tem|trat(?:ou|aram)|atend(?:eu|eram))";

export function extractOperatorName(value) {
  return extractByPatterns(value, [
    /\b(?:operador|respons[áa]vel|atendente|usu[áa]rio)\s+(?!(?:mais|menos)\b)(.+)$/iu,
    new RegExp(`\\b(?:por|pel[ao])\\s+(?!${OPERATOR_BY_EXCLUSION_SOURCE})(.+)$`, "iu"),
    new RegExp(`\\bd[oa]\\s+(?!${OPERATOR_DO_DA_EXCLUSION_SOURCE})(.+)$`, "iu"),
    // "Quantos tickets o Fábio Gali tem em aberto?" (achado testando o
    // lote de perguntas ao vivo): mesmo padrão de extractOperatorWorkloadName
    // ("quantos tickets <nome> tem"), mas SEM exigir que "tem" feche a
    // frase — aqui o resultado só alimenta o filtro genérico de operador
    // (combinado com o resto da pergunta já resolvido, ex. "em aberto"),
    // não força a rota de carga (que perderia os outros filtros) como
    // extractOperatorWorkloadName faz.
    new RegExp(
      `\\bquantos\\s+(?:tickets?|chamados?|atendimentos?)\\s+(?!(?:a\\s+|o\\s+)?(?:${OPERATOR_WORKLOAD_EXCLUSION_SOURCE}))(?:a\\s+|o\\s+)?(.+?)\\s+${OPERATOR_WORKLOAD_VERB_SOURCE}\\b.*$`,
      "iu",
    ),
  ]);
}

export function extractClientName(value) {
  return extractByPatterns(value, [
    /\bcliente\s+(?:chamado\s+|de\s+nome\s+)?(?!(?:mais|menos)\b)(.+)$/iu,
    // "ticket QUE A/O <nome> abriu" (achado testando o lote de perguntas ao
    // vivo — Img 12): quem abre um ticket é o cliente/contato, não precisa
    // da palavra "cliente" explícita — "que" como âncora evita capturar
    // qualquer "X abriu" solto fora desse contexto bem específico.
    /\bque\s+(?:o\s+|a\s+)?(?!(?:mais|menos)\b)(.+?)\s+abriu\b/iu,
  ]);
}

// "O cliente X abre muito(s) chamado(s)/ticket(s)?" / "...tem muitos
// tickets?" / "...está com muitos chamados?" (achado testando o lote de
// perguntas ao vivo — Img 7): a tool analisar_atividade_cliente já existia
// (Img 33, versão de comparação entre 2 clientes), mas não tinha rota pra
// UM cliente só, apesar da própria descrição da tool citar esse exemplo de
// pergunta. Exige a palavra "cliente" explícita, mesma cautela de
// extractClientComparisonNames — cliente não tem catálogo/resolveMetaId
// próprio (só substring contra o contact_name real), então um nome
// capturado errado não falha graciosamente como "não encontrado" sozinho.
export function extractClientActivityName(value) {
  return extractByPatterns(value, [
    /^(?:o\s+|a\s+)?cliente\s+(.+?)\s+(?:esta|está|estao|estão)\s+com\s+muito[s]?\s+(?:ticket|chamado|atendimento)/iu,
    /^(?:o\s+|a\s+)?cliente\s+(.+?)\s+tem\s+muito[s]?\s+(?:ticket|chamado|atendimento)/iu,
    new RegExp(
      `^(?:o\\s+|a\\s+)?cliente\\s+(.+?)\\s+${CLIENT_ACTIVITY_VERB_SOURCE}\\s+muito[s]?\\s+(?:ticket|chamado|atendimento)`,
      "iu",
    ),
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

// "baixa/média/alta prioridade" (forma "adjetivo antes do substantivo") —
// só usado pra detectar CONTRADIÇÃO (achado P6 da auditoria end-to-end, ex.:
// "tickets urgentes de baixa prioridade"), nunca pra definir o filtro de
// prioridade sozinho: "baixa"/"média"/"alta" soltas continuam de propósito
// fora de extractPriorityIntent (adjetivos comuns demais, ver comentário
// abaixo) — aqui só entram quando acompanhadas da palavra "prioridade".
const PRIORITY_LEVEL_LITERAL_PATTERNS = [
  [/\bbaixa\s+prioridade\b/, "Baixa"],
  [/\bmedia\s+prioridade\b/, "Media"],
  [/\balta\s+prioridade\b/, "Alta"],
];

export function extractPriorityName(value) {
  return extractByPatterns(value, [
    /\bprioridade\s+(?:de\s+)?(.+)$/iu,
  ]);
}

// "Urgente" é uma prioridade real do sistema (distinta de "Alta"), então a
// palavra solta já é um sinal inequívoco, mesmo sem a palavra "prioridade"
// do lado. "Crítico"/"críticos" é tratado como sinônimo de urgente pelo
// mesmo motivo — "os tickets mais críticos" é um jeito comum de perguntar
// por prioridade alta sem usar o vocabulário exato do sistema. Não
// generalizamos para "alta/média/baixa" soltas: são adjetivos comuns demais
// em português e dariam falso positivo fora do contexto.
export function extractPriorityIntent(value) {
  const text = normalizeText(value);

  return (
    extractPriorityName(value)
    ?? (/\burgente/.test(text) ? "Urgente" : undefined)
    ?? (/\bcritic[oa]s?\b/.test(text) ? "Urgente" : undefined)
  );
}

// "usuário" é a palavra que essas frases de busca de cadastro esperavam
// originalmente, mas "operador"/"responsável"/"atendente" são tratados como
// sinônimos dela em todo o resto do arquivo (ex.: extractOperatorName,
// logo abaixo) — faltava aqui. Sem isso, "Quem é o operador Helpdesk?"
// não batia em nenhum padrão e caía no fallback de listagem (devolvia
// tickets filtrados por operador, não o cadastro da pessoa).
const USER_LOOKUP_NOUN_SOURCE = "usu[áa]rio|operador|respons[áa]vel|atendente";

export function extractUserName(value) {
  return extractByPatterns(value, [
    new RegExp(
      `\\b(?:busque|busca|procure|procura|encontre|encontra)\\s+(?:o\\s+|a\\s+)?(?:${USER_LOOKUP_NOUN_SOURCE})s?\\s+(?:chamados?\\s+|de\\s+nome\\s+)?(.+)$`,
      "iu",
    ),
    new RegExp(`\\b(?:${USER_LOOKUP_NOUN_SOURCE})\\s+(?:chamado\\s+|de\\s+nome\\s+)(.+)$`, "iu"),
    new RegExp(`\\bquem\\s+[ée]\\s+(?:o\\s+|a\\s+)?(?:${USER_LOOKUP_NOUN_SOURCE})\\s+(.+)$`, "iu"),
    new RegExp(`\\binforma[çc][õo]es\\s+(?:do|sobre\\s+o)\\s+(?:${USER_LOOKUP_NOUN_SOURCE})\\s+(.+)$`, "iu"),
    // "Qual é o e-mail do usuário X?" (achado testando o lote de perguntas
    // ao vivo — Img 2): pergunta por um dado específico do cadastro
    // (e-mail), mesma intenção de busca de usuário das outras 4 variantes
    // acima, só com "e-mail" como gatilho em vez de "busque"/"quem é"/
    // "informações".
    new RegExp(`\\be-?mail\\s+(?:do|da|de)\\s+(?:${USER_LOOKUP_NOUN_SOURCE})\\s+(.+)$`, "iu"),
  ]);
}

// "Fábio está com muito ticket na mão?" / "Fábio tem muitos chamados?" /
// "Fábio está sobrecarregado?" — nome solto antes de uma frase de carga de
// trabalho, sem palavra-marcador como "operador". Alimenta a análise de
// carga por operador (analisar_carga_operador), não um filtro de listagem.
//
// O lookahead (OPERATOR_WORKLOAD_EXCLUSION_SOURCE, declarado mais acima,
// perto de extractOperatorName, que também reaproveita) usado só no padrão
// "quantos tickets <nome> tem" evita que outra dimensão já coberta por
// marcador próprio ("quantos tickets a área Suporte tem", "quantos tickets
// o departamento Governança tem") seja capturada como se fosse um nome de
// operador — essas frases já são resolvidas certo mais adiante, na rota de
// resumo por filtro citado; sem essa exclusão, o padrão de carga (que roda
// antes na cascata) venceria primeiro e tentaria (e falharia) resolver
// "área Suporte" como operador.
export function extractOperatorWorkloadName(value) {
  return extractByPatterns(value, [
    /^(.+?)\s+(?:esta|está|estao|estão)\s+com\s+muito[s]?\s+(?:ticket|chamado|atendimento)/iu,
    /^(.+?)\s+(?:esta|está|estao|estão)\s+sobrecarregad[oa]s?\b/iu,
    /^(.+?)\s+tem\s+muito[s]?\s+(?:ticket|chamado|atendimento)/iu,
    // "Quantos tickets a Ana Costa tem?" — mesma pergunta de carga, só em
    // ordem de pergunta ("quantos X <nome> tem") em vez de afirmação
    // ("<nome> tem muitos X"). O "$" no final (permitindo só pontuação
    // depois de "tem") exige que "tem" feche a frase — sem isso, frases bem
    // mais complexas tipo "quantos chamados fechados o operador cesar tem
    // no departamento coids desde..." também bateriam nesse "tem" solto no
    // meio da frase, atropelando a rota certa (status fechado + operador +
    // departamento) com uma carga de operador incompleta.
    new RegExp(
      `\\bquantos\\s+(?:tickets?|chamados?|atendimentos?)\\s+(?!(?:a\\s+|o\\s+)?(?:${OPERATOR_WORKLOAD_EXCLUSION_SOURCE}))(?:a\\s+|o\\s+)?(.+?)\\s+tem\\s*[?!.]*$`,
      "iu",
    ),
  ]);
}

// "Compare a carga do X com a do Y" / "diferença de carga entre X e Y" —
// exige a palavra "carga" explicitamente (não generaliza pra "compare X e
// Y" solto, que é ambíguo demais e poderia capturar nomes de área/
// departamento por engano). Cobre só o caso claro de comparação de 2
// operadores, que é o exemplo de "pergunta composta" mais comum. "X está
// com mais tickets que Y"/"X tem mais chamados que Y" é a mesma ideia sem a
// palavra "carga" — mesmo vocabulário comparativo já aceito no singular por
// extractOperatorWorkloadName ("Fulano está com muitos tickets"), só que
// entre 2 nomes em vez de 1.
export function extractOperatorComparisonNames(value) {
  const text = String(value ?? "");

  const patterns = [
    /\bcompar[ae]\s+a\s+carga\s+(?:d[oa]\s+)?(.+?)\s+(?:com|e)\s+(?:a\s+(?:carga\s+)?d[oa]\s+)?(.+)$/iu,
    /\bdiferen[cç]a\s+de\s+carga\s+entre\s+(.+?)\s+e\s+(.+)$/iu,
    /^(.+?)\s+(?:esta|está|estao|estão)\s+com\s+mais\s+(?:tickets?|chamados?|atendimentos?)\s+(?:do\s+)?que\s+(?:o\s+|a\s+)?(.+)$/iu,
    /^(.+?)\s+tem\s+mais\s+(?:tickets?|chamados?|atendimentos?)\s+(?:do\s+)?que\s+(?:o\s+|a\s+)?(.+)$/iu,
    // "atende(m) mais tickets/chamados que" (achado testando o lote de
    // perguntas ao vivo — Img 28): mesma ideia comparativa de "tem"/"está
    // com", só que com o verbo "atender", também comum na fala natural.
    /^(.+?)\s+atendem?\s+mais\s+(?:tickets?|chamados?|atendimentos?)\s+(?:do\s+)?que\s+(?:o\s+|a\s+)?(.+)$/iu,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    const nome1 = cleanFreeText(match[1]);
    const nome2 = cleanFreeText(match[2]);

    if (nome1 !== undefined && nome2 !== undefined) {
      return [nome1, nome2];
    }
  }

  return undefined;
}

// Mesma ideia de extractOperatorComparisonNames, mas pra 2 CLIENTES em vez
// de 2 operadores (achado testando o lote de perguntas ao vivo — Img 33):
// "Quem abriu mais chamados: o cliente X ou o cliente Y?" não tinha nenhum
// suporte, caía sempre no fallback genérico sem comparação nenhuma. Exige a
// palavra "cliente" explícita nos dois lados (não generaliza pra "compare X
// e Y" solto, que já é reservado pra operador).
export function extractClientComparisonNames(value) {
  const text = String(value ?? "");

  const patterns = [
    /\bquem\s+abriu\s+mais\s+(?:tickets?|chamados?|atendimentos?)\s*:?\s*(?:o\s+)?cliente\s+(.+?)\s+ou\s+(?:o\s+)?cliente\s+(.+)$/iu,
    /^(?:o\s+)?cliente\s+(.+?)\s+abriu\s+mais\s+(?:tickets?|chamados?|atendimentos?)\s+(?:do\s+)?que\s+(?:o\s+)?cliente\s+(.+)$/iu,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    const nome1 = cleanFreeText(match[1]);
    const nome2 = cleanFreeText(match[2]);

    if (nome1 !== undefined && nome2 !== undefined) {
      return [nome1, nome2];
    }
  }

  return undefined;
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

// Nenhuma tool é chamada — a pergunta é honestamente ambígua ou pede algo
// que as tools disponíveis não sustentam (negação/exclusão), então a
// resposta certa é pedir esclarecimento, não adivinhar ou ignorar em
// silêncio (itens 3 e 4 do plano de correção da auditoria).
function createClarificationDecision(intent, mensagem) {
  return {
    entity: "ticket",
    intent,
    toolNames: [],
    entities: {},
    fallback: false,
    clarification: mensagem,
  };
}

// "Compare X e Y" — a MESMA tool roda duas vezes (uma por lado), decidido
// aqui de forma totalmente determinística (nenhuma escolha do LLM), mesma
// garantia do caminho de 1 tool só que generalizada pra 2 chamadas fixas.
function createCompareDecision(intent, comparisons) {
  return {
    entity: "ticket",
    intent,
    toolNames: [comparisons[0].toolName],
    entities: {},
    compare: comparisons,
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

  // Comparação entre 2 tickets ou 2 operadores — checado antes de qualquer
  // outra intenção, já que "compare o ticket X com o Y" não deve cair no
  // caminho de número único (buscaria só o primeiro e ignoraria o segundo).
  const comparacaoTickets = extractTicketComparisonNumbers(pergunta);

  if (comparacaoTickets !== undefined) {
    return createCompareDecision("comparar_tickets", [
      { toolName: "buscar_ticket_por_numero", args: { numero: comparacaoTickets[0] } },
      { toolName: "buscar_ticket_por_numero", args: { numero: comparacaoTickets[1] } },
    ]);
  }

  const comparacaoOperadores = extractOperatorComparisonNames(pergunta);

  if (comparacaoOperadores !== undefined) {
    return createCompareDecision("comparar_carga_operador", [
      { toolName: "analisar_carga_operador", args: { operador: comparacaoOperadores[0] } },
      { toolName: "analisar_carga_operador", args: { operador: comparacaoOperadores[1] } },
    ]);
  }

  const comparacaoClientes = extractClientComparisonNames(pergunta);

  if (comparacaoClientes !== undefined) {
    return createCompareDecision("comparar_atividade_cliente", [
      { toolName: "analisar_atividade_cliente", args: { cliente: comparacaoClientes[0] } },
      { toolName: "analisar_atividade_cliente", args: { cliente: comparacaoClientes[1] } },
    ]);
  }

  // "ainda não fechado"/"não encerrado"/"não resolveu"/"não fechou" (formas
  // adjetiva e verbal) significam aberto, mas contêm palavras que indicariam
  // fechado — tratadas à parte, negando isFechadoIntent e alimentando
  // isAbertoIntent. Calculado cedo (antes do bloco de resumos) porque
  // resumo_tickets_por_operador também usa a situação aberto/fechado.
  // Além de "não" (com estar/foi/foram opcional), "diferente de"/"exceto"
  // antes do verbo de fechamento significam exatamente a mesma coisa
  // ("status diferente de encerrado" = "não encerrado") — fechado/aberto é
  // uma dimensão de 2 valores só, então negar um dos dois SEMPRE resolve
  // pro outro sem ambiguidade (diferente de área/prioridade/operador/status
  // literal, que têm N valores possíveis — ver detectaNegacaoNaoSuportada
  // abaixo, que trata esses casos como "não suportado" em vez de inverter).
  // "sem contar"/"tirando" (achado testando o lote de perguntas ao vivo —
  // Img 13) são a mesma ideia de exclusão em outro idioma comum: "quantos
  // tickets o Fulano tratou, SEM CONTAR os fechados?" também significa
  // "aberto", mas não batia em nenhum marcador antes — o sistema lia
  // "fechados" como filtro POSITIVO (o oposto do pedido), já que só
  // "não"/"diferente de"/"exceto" eram reconhecidos como negação.
  const NEGATION_PREFIX_SOURCE =
    "(?:nao\\s+(?:esta\\s+|estao\\s+|foi\\s+|foram\\s+)?"
    + "|diferentes?\\s+de\\s+"
    + "|excet[oa]\\s+(?:o\\s+|os\\s+|a\\s+|as\\s+)?"
    + "|sem\\s+contar\\s+(?:o\\s+|os\\s+|a\\s+|as\\s+)?"
    + "|tirando\\s+(?:o\\s+|os\\s+|a\\s+|as\\s+)?)";
  const NEGATED_CLOSED_SOURCE = `${NEGATION_PREFIX_SOURCE}${CLOSURE_VERB_SOURCE}`;
  const isNegatedClosed = new RegExp(`\\b${NEGATED_CLOSED_SOURCE}\\b`).test(text);

  // "foi aberto"/"foram abertos" é voz passiva pra dizer que o ticket foi
  // CRIADO num período (ex.: "quantos tickets foram abertos ano passado?"),
  // não que ele está com status em aberto agora — o período já é resolvido
  // à parte via extractDateRange/extractRelativeDateRange; aqui só evita que
  // isso vire (erradamente) um filtro de situação=aberto (o que faria
  // "aberto ano passado" exigir também estar aberto HOJE, quase sempre 0).
  const isCreationPassive = new RegExp(`\\b${CREATION_VERB_SOURCE}\\b`).test(text);

  const isAbertoIntent =
    (/\babert[oa]s?\b/.test(text) && !isCreationPassive)
    || /\bpendente/.test(text)
    || isNegatedClosed;

  // Item 7 do plano de correção da auditoria (achado B10): "resolveu"/
  // "concluiu"/"finalizou" são verbos genéricos do dia a dia, não exclusivos
  // do domínio de tickets — confirmado ao vivo: "A diretoria resolveu
  // trocar de fornecedor" (frase sem nenhuma relação com tickets) roteava
  // pra listar_tickets_fechados. Só conta como intenção de fechado quando a
  // frase também tem uma pista de que é sobre TICKETS: a palavra
  // ticket/chamado/atendimento/ocorrência/solicitação em qualquer forma, OU
  // outro filtro de ticket já extraído (área/departamento/operador/
  // prioridade/status/cliente/número) — como em "a área Suporte resolveu
  // essa semana" (sem a palavra "chamado", mas com "área" como pista clara).
  const hasTicketDomainContext =
    new RegExp(`\\b${TICKET_CONTEXT_SOURCE}\\b`, "u").test(text)
    || area !== undefined
    || departamento !== undefined
    || operador !== undefined
    || prioridade !== undefined
    || status !== undefined
    || cliente !== undefined
    || numero !== undefined;

  const isFechadoIntent =
    new RegExp(`\\b${CLOSURE_VERB_SOURCE}\\b`).test(text)
    && !isNegatedClosed
    && hasTicketDomainContext;

  // Hoisted pra cima do que era a posição original (mais abaixo, cada um no
  // próprio bloco `if`) porque o detector de negação (mais abaixo) e o de
  // termo ambíguo "parado" (item 4 do plano de correção) precisam saber se
  // uma intenção mais específica já resolveu a palavra antes de decidir se
  // vale a pena pedir esclarecimento.
  const isCongeladoIntent =
    /\bcongelad/.test(text)
    || /\btravad/.test(text)
    || /\bparalisad/.test(text)
    || /\b(?:sla|relogio|tempo|prazo)\s+(?:parad[oa]|pausad[oa]|suspens[oa])\b/.test(text);

  const isSemOperadorIntent =
    /\bsem\s+(?:operador|responsavel|atendente|dono)\b/.test(text)
    || /\bsem\s+ninguem\b/.test(text)
    || /\bnao\s+(?:foi\s+|foram\s+|esta\s+|estao\s+)?atribuid/.test(text)
    // "não tem operador"/"não têm responsável" — negação do verbo "ter", não
    // só de "atribuído" (ex.: "quantos tickets não têm operador?").
    || /\bnao\s+tem\s+(?:operador|responsavel|atendente)\b/.test(text)
    || /\bninguem\s+(?:e\s+)?(?:responsavel|pegando|atendendo|cuidando|resolvendo)\b/.test(text)
    // "atendido(s)/resolvido(s)/tratado(s) POR NINGUÉM" (achado testando o
    // lote de perguntas ao vivo — Img 8) é a mesma ideia do padrão acima,
    // só com o verbo antes de "ninguém" em vez de depois — ordem de frase
    // comum que ainda não estava coberta.
    || /\bpor\s+ninguem\b/.test(text)
    || /\baguardando\s+atribuicao\b/.test(text);

  // "Mais antigo"/"mais velho"/"há mais tempo" pede ordem cronológica —
  // não necessariamente estourou o SLA. Fica separado da intenção de
  // "vencido"/"atrasado" abaixo, que agora usa o SLA real por ticket (ver
  // listar_tickets_vencidos em src/server.js), não mais um proxy.
  const isOldestOpenIntent =
    /\bmais\s+antig/.test(text)
    || /\bmais\s+velh/.test(text)
    || /\bha\s+mais\s+tempo\b/.test(text);

  // "Atrasado"/"vencido"/"estourado" agora usam o SLA real (result_sla_
  // response/result_sla_solution) por ticket, em vez do proxy antigo de
  // "aberto mais antigo" — achado do usuário: um ticket pode estourar o
  // SLA e DEPOIS ser encerrado, então restringir a busca a só os abertos
  // escondia esses casos.
  const isSlaVencidoIntent = new RegExp(`\\b${OLDEST_PROXY_STATE_SOURCE}\\b`, "u").test(text);

  // Item 3 do plano de correção da auditoria: nenhuma tool MCP (nem a API
  // por trás delas) sustenta "excluir X" — hoje "sem prioridade urgente" /
  // "exceto os cancelados" / "diferente de X" filtram pelo valor CITADO,
  // exatamente o oposto do pedido (achado B3/F, confirmado ao vivo). Em vez
  // de inverter o filtro (impossível de fazer com segurança — negar
  // "urgente" não diz se o usuário quer alta+média+baixa, ou só uma delas)
  // ou de ignorar a negação em silêncio, o sistema avisa honestamente que
  // não sustenta isso. NÃO reage aos 2 idiomas que já são tratados como
  // intenção própria e correta: negação de fechado (vira aberto, acima) e
  // "sem operador"/"não atribuído" (vira isSemOperadorIntent).
  // "tirando"/"sem contar" (achado testando o lote de perguntas ao vivo —
  // Img 11): "Quantos tickets tem, TIRANDO os cancelados?" capturava
  // status: "Cancelado" como filtro POSITIVO (o oposto do pedido) e nem
  // caía aqui, porque nenhum marcador reconhecia "tirando" como negação —
  // mesma classe de idioma já coberta em NEGATION_PREFIX_SOURCE acima, só
  // que "cancelado" não é um valor de 2 opções só (status literal tem N
  // valores possíveis), então aqui o tratamento certo é o esclarecimento,
  // não inverter.
  const NEGATION_MARKER_SOURCE = "(?:nao|excet[oa]|diferentes?\\s+de|tirando|sem\\s+contar)";
  const NEGATION_MARKER_PATTERN = new RegExp(`\\b${NEGATION_MARKER_SOURCE}\\b`, "u");
  const LEADING_NEGATION_PATTERN = new RegExp(`^${NEGATION_MARKER_SOURCE}\\b`, "iu");

  // true quando existe um marcador de negação nas ~5 palavras ANTES do
  // trecho (needle) dentro do texto normalizado — cobre "que NÃO seja
  // urgente", "NÃO pertencentes ao departamento X", "tickets urgentes NÃO
  // estão atrasados".
  function hasNegationBefore(haystack, needle) {
    if (!needle) {
      return false;
    }

    const index = haystack.indexOf(needle);

    if (index === -1) {
      return false;
    }

    const janela = haystack.slice(0, index).trim().split(/\s+/u).slice(-5).join(" ");

    return NEGATION_MARKER_PATTERN.test(janela);
  }

  function detectaNegacaoNaoSuportada() {
    for (const valor of [area, departamento, operador, prioridade, status]) {
      if (valor === undefined) {
        continue;
      }

      const valorNormalizado = normalizeText(valor);

      // B1: "diferente de X"/"exceto X" às vezes vaza inteiro pro valor
      // capturado (ex.: operador: "diferente de João") — se o próprio valor
      // COMEÇA com o marcador, já é negação, sem precisar procurar antes.
      if (LEADING_NEGATION_PATTERN.test(valorNormalizado) || hasNegationBefore(text, valorNormalizado)) {
        return true;
      }
    }

    // "sem prioridade X" é negação (excluir X), diferente de "sem operador"
    // (estado — ninguém atribuído). Só conta quando um valor real foi
    // capturado depois de "prioridade" — não é a mesma pergunta que "sem
    // prioridade definida" (sem valor nenhum).
    if (prioridade !== undefined && /\bsem\s+prioridade\b/.test(text)) {
      return true;
    }

    if (isSlaVencidoIntent) {
      const match = new RegExp(`\\b${OLDEST_PROXY_STATE_SOURCE}\\b`, "u").exec(text);

      if (match && hasNegationBefore(text, match[0])) {
        return true;
      }
    }

    return false;
  }

  if (!isNegatedClosed && !isSemOperadorIntent && detectaNegacaoNaoSuportada()) {
    return createClarificationDecision(
      "esclarecimento_negacao",
      "Não consigo filtrar excluindo um valor (\"diferente de\"/\"exceto\"/\"não\" aplicado a status, área, departamento, operador, prioridade ou prazo) — as consultas disponíveis só filtram por um valor específico citado, não por exclusão. Pode reformular dizendo exatamente qual valor você quer ver?",
    );
  }

  // Achado P6 da auditoria end-to-end: perguntas com 2 valores mutuamente
  // exclusivos da mesma dimensão (ex.: "tickets urgentes de baixa
  // prioridade", "tickets encerrados que estão em atendimento") eram
  // resolvidas silenciosamente pra um dos dois lados, sem avisar da
  // contradição — confirmado ao vivo nos dois casos.
  function detectaContradicao() {
    // Prioridade: o valor já resolvido (via "urgente"/"crítico" solto ou
    // "prioridade X" direto) conflita com uma menção explícita "<nível>
    // prioridade" de nível diferente na mesma frase.
    if (prioridade !== undefined) {
      for (const [pattern, nivel] of PRIORITY_LEVEL_LITERAL_PATTERNS) {
        if (pattern.test(text) && normalizeText(nivel) !== normalizeText(prioridade)) {
          return true;
        }
      }
    }

    // Situação: todo status literal reconhecido (STATUS_LITERAL_PATTERNS)
    // representa um estado NÃO fechado (fechado/encerrado é tratado à parte
    // via closure_date, nunca entra nessa lista, ver comentário na
    // declaração) — se a frase também pede "fechado"/"encerrado", as duas
    // coisas nunca podem ser verdade ao mesmo tempo.
    if (isFechadoIntent && status !== undefined) {
      return true;
    }

    return false;
  }

  if (detectaContradicao()) {
    return createClarificationDecision(
      "esclarecimento_contradicao",
      "Essa pergunta parece pedir duas coisas que não podem ser verdade ao mesmo tempo (por exemplo, duas prioridades diferentes, ou um status que não combina com \"fechado\"/\"encerrado\"). Pode reformular dizendo só o que você quer ver?",
    );
  }

  // Item 4 do plano de correção: "parado" sozinho, sem nenhum qualificador
  // por perto, é ambíguo no domínio (pode ser SLA congelado, sem operador,
  // ou só "ticket antigo") — hoje era ignorado em silêncio (virava
  // listar_tickets sem filtro nenhum, sem avisar que a palavra não foi
  // interpretada). Só dispara quando NENHUMA intenção mais específica já
  // resolveu a palavra (SLA parado → congelado; "ninguém... parado" → sem
  // operador).
  const hasAmbiguousParado =
    /\bparad[oa]s?\b/.test(text) && !isCongeladoIntent && !isSemOperadorIntent;

  if (hasAmbiguousParado) {
    return createClarificationDecision(
      "esclarecimento_termo_ambiguo",
      "\"Parado\" pode significar SLA congelado, sem operador atribuído ou só o ticket mais antigo em aberto — pode dizer qual dessas situações você quer ver?",
    );
  }

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
    || /\btop\s+\d+\b/.test(text)
    || new RegExp(`\\b${RANKING_CUE_SOURCE}\\b`).test(text);

  const mentionsStatusDimension = mentionsDimension(text, "status");
  const mentionsPriorityDimension = mentionsDimension(text, "prioridades?");
  const mentionsAreaDimension = mentionsDimension(text, "areas?|categorias?");
  const mentionsOperatorDimension = mentionsDimension(text, "operador(?:es)?");
  const mentionsDepartmentDimension = mentionsDimension(text, "departamentos?");
  const mentionsClienteDimension = mentionsDimension(text, "clientes?|solicitantes?");

  // "Quem tem mais chamados...?" / "Quem mais tem...?" (ordem invertida) /
  // "Quem tem menos...?" já implicam ranking por operador nesse domínio,
  // mesmo sem a palavra "operador" (ex.: "...no time"/"na equipe").
  const isOperatorRankingIntent =
    /\bquem\s+(?:tem|possui|esta\s+com)\s+(?:mais|menos)\b/.test(text)
    || /\bquem\s+(?:mais|menos)\s+(?:tem|possui|esta\s+com)\b/.test(text);

  // Direção do ranking pedido: "menos" (ascendente, menor primeiro) vs.
  // "mais"/nada (descendente, padrão). Exclui "menos de N dias"/"pelo menos
  // N" — não são ranking, são limiar/quantidade mínima.
  const ordemRanking =
    /\bmenos\b(?!\s+de\b)/.test(text) && !/\bpelo\s+menos\b/.test(text)
      ? "asc"
      : undefined;

  // Perguntas de "visão geral" da operação — não é uma dimensão específica,
  // é um retrato amplo (total, abertos, fechados, sem operador, congelados,
  // por prioridade, backlog antigo).
  const isDashboardIntent =
    // "resumo operacional"/"resumo geral" é o nome da própria intenção
    // (usado no título da tool e no que o usuário digita na prática) —
    // faltava na lista original, que só cobria frases mais informais tipo
    // "visão geral"/"como está a operação".
    /\bresumo\s+(?:operacional|geral)\b/.test(text)
    || /\bvisao\s+geral\b/.test(text)
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
      compactEntities({ area, departamento, operador, prioridade, limite, dataInicio, dataFim, ordem: ordemRanking }),
    );
  }

  if (hasResumoIntent && mentionsPriorityDimension) {
    return createTicketDecision(
      "resumo_por_prioridade",
      "resumo_tickets_por_prioridade",
      compactEntities({ status, area, departamento, operador, limite, dataInicio, dataFim, ordem: ordemRanking }),
    );
  }

  if (hasResumoIntent && mentionsAreaDimension) {
    return createTicketDecision(
      "resumo_por_area",
      "resumo_tickets_por_area",
      compactEntities({
        status,
        departamento,
        operador,
        prioridade,
        limite,
        dataInicio,
        dataFim,
        ordem: ordemRanking,
      }),
    );
  }

  if (hasResumoIntent && (mentionsOperatorDimension || isOperatorRankingIntent)) {
    return createTicketDecision(
      "resumo_por_operador",
      "resumo_tickets_por_operador",
      compactEntities({
        status,
        area,
        departamento,
        prioridade,
        situacao: situacaoInequivoca,
        limite,
        dataInicio,
        dataFim,
        ordem: ordemRanking,
      }),
    );
  }

  if (hasResumoIntent && mentionsDepartmentDimension) {
    return createTicketDecision(
      "resumo_por_departamento",
      "resumo_tickets_por_departamento",
      // dataInicio/dataFim faltavam aqui (achado B13/item 6 do plano de
      // correção): "Quantos tickets por departamento entre 2026-01-01 e
      // 2026-02-01?" descartava o período em silêncio, diferente de todo
      // branch irmão (status/prioridade/área/operador/cliente), que já
      // repassa a data extraída no topo da função.
      compactEntities({ status, area, operador, limite, dataInicio, dataFim, ordem: ordemRanking }),
    );
  }

  if (hasResumoIntent && mentionsClienteDimension) {
    return createTicketDecision(
      "resumo_por_cliente",
      "resumo_tickets_por_cliente",
      compactEntities({
        status,
        area,
        departamento,
        operador,
        prioridade,
        limite,
        dataInicio,
        dataFim,
        ordem: ordemRanking,
      }),
    );
  }

  if (numero !== undefined) {
    return createTicketDecision(
      "buscar_por_numero",
      "buscar_ticket_por_numero",
      { numero },
    );
  }

  if (isCongeladoIntent) {
    return createTicketDecision(
      "listar_congelados",
      "listar_tickets_congelados",
      compactEntities({ status, area, departamento, operador, cliente, prioridade, dataInicio, dataFim, limite, pagina }),
    );
  }

  // Checado ANTES da busca textual de propósito (item 2 do plano de
  // correção da auditoria de interpretação): "informações sobre o usuário
  // X" / "quem é o usuário X" e "tickets sobre impressora" competem pela
  // mesma palavra "sobre", mas extractUserName tem padrões mais
  // específicos — se ele bater, é sempre a intenção certa (busca de
  // usuário), não busca textual genérica.
  const nomeUsuario = extractUserName(pergunta);

  if (nomeUsuario !== undefined) {
    return createTicketDecision(
      "buscar_usuario_por_nome",
      "buscar_usuarios_por_nome",
      { nome: nomeUsuario },
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
        cliente,
        prioridade,
        situacao: situacaoInequivoca,
        dataInicio,
        dataFim,
        limite,
        pagina,
      }),
    );
  }

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
        operador: extractOperatorName(pergunta),
        cliente,
        prioridade,
        limite: limite ?? (numeroSolto ? Number(numeroSolto[1]) : undefined),
        pagina,
      }),
    );
  }

  if (isSlaVencidoIntent) {
    const numeroSolto = text.replace(/\bpagina\s+\d+\b/g, "").match(/\b(\d+)\b/);

    return createTicketDecision(
      "listar_vencidos",
      "listar_tickets_vencidos",
      compactEntities({
        status,
        area,
        departamento,
        operador: extractOperatorName(pergunta),
        cliente,
        prioridade,
        situacao: situacaoInequivoca,
        dataInicio,
        dataFim,
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

  // "O cliente X abre muito(s) chamado(s)?" (Img 7) — mesma ideia de
  // operadorCarga acima, só que pra atividade de UM cliente só.
  const clienteAtividade = extractClientActivityName(pergunta);

  if (clienteAtividade !== undefined) {
    return createTicketDecision(
      "analisar_atividade_cliente",
      "analisar_atividade_cliente",
      { cliente: clienteAtividade },
    );
  }

  // Item 9 do plano de correção (achado B12): "primeiro"/"primeira" sozinho,
  // no domínio de tickets, é mais comumente o CONTRÁRIO de "mais recente" (o
  // mais antigo/o 1º cronológico) — confirmado ao vivo: "Qual foi o primeiro
  // ticket aberto?" (pergunta pelo mais antigo) roteava pra mais_recentes,
  // sentido invertido. "primeiros N tickets" (com número) tinha sido restrito
  // a esse mesmo gatilho de "mais recentes" pra dar uma ordem previsível
  // qualquer — mas é o mesmo sentido invertido do caso singular, só
  // confirmado depois ao vivo pelo usuário: "primeiros N" lido naturalmente
  // também significa os N cronologicamente primeiros (mais antigos), não os
  // mais recentes. Por isso tem rota própria (mais_antigos, entre TODOS os
  // tickets — abertos e fechados, ao contrário de
  // listar_tickets_abertos_mais_antigos, que é só sobre os ainda abertos).
  // Aceita as 2 ordens naturais em português: "primeiros 5" e "5 primeiros"
  // (ex.: "os 5 primeiros tickets fechados") — achado ao vivo: só a primeira
  // ordem estava coberta, a segunda caía no fallback de aberto/fechado sem
  // limite nem ordenação nenhuma.
  const isOldestOverallWithCountIntent = /\bprimeir[oa]s?\s+\d+\b|\b\d+\s+primeir[oa]s?\b/.test(text);

  // "primeiro"/"primeira" SOZINHO, sem número (achado testando o lote de
  // perguntas ao vivo — Img 12): "Primeiro ticket que a Sabrina Mariotto
  // abriu" não batia no padrão acima (não tem dígito nenhum) e caía inteiro
  // no fallback de listagem sem filtro nenhum. Mesmo sentido (mais antigo,
  // não mais recente) do caso com número, só que pedindo exatamente 1.
  const isBareOldestOverallIntent =
    !isOldestOverallWithCountIntent && /\bprimeir[oa]\b/.test(text);

  const isOldestOverallIntent = isOldestOverallWithCountIntent || isBareOldestOverallIntent;

  // "ultimo" também ganhou o \b de fechamento que faltava (bug de regex
  // simples, evita casar como prefixo de outra palavra). "por ultimo" no
  // início da frase é conectivo de discurso ("por último, me diz..."), não
  // pedido de ordenação por recência — mesma classe de falso positivo do
  // item 8 (cortesia/discurso não é nome), confirmado ao vivo: "Por último,
  // me diz quantos tickets tem no total" roteava pra mais_recentes, ignorando
  // a pergunta real (quantidade total).
  const isMostRecentIntent =
    (/\brecent/.test(text)
      || /\bultimos?\b/.test(text)
      || /\bmais\s+nov[oa]/.test(text)
      || /\brecem\b/.test(text))
    && !/\bpor\s+ultimo\b/.test(text);

  if (isOldestOverallIntent) {
    const numeroSolto = text.replace(/\bpagina\s+\d+\b/g, "").match(/\b(\d+)\b/);

    return createTicketDecision(
      "listar_mais_antigos",
      "listar_tickets_mais_antigos",
      compactEntities({
        status,
        area,
        departamento,
        operador: extractOperatorName(pergunta),
        cliente,
        prioridade,
        situacao: situacaoInequivoca,
        limite: limite ?? (numeroSolto ? Number(numeroSolto[1]) : (isBareOldestOverallIntent ? 1 : undefined)),
        pagina,
      }),
    );
  }

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
        operador: extractOperatorName(pergunta),
        cliente,
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
      // status entra aqui (achado Img 31): "tickets abertos aguardando
      // atendimento" tinha o status literal extraído no topo da função, mas
      // esse branch descartava em silêncio — mesma classe do B13/item 6 do
      // plano de correção, só que faltando nesta dupla específica em vez
      // das de resumo. Seguro aqui porque detectaContradicao já barra a
      // combinação equivalente do lado fechado (status literal nunca é um
      // status de fechamento).
      compactEntities({
        status,
        area,
        departamento,
        operador: extractOperatorName(pergunta),
        cliente,
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
        status,
        area,
        departamento,
        operador: extractOperatorName(pergunta),
        cliente,
        prioridade,
        dataInicio,
        dataFim,
        limite,
        pagina,
      }),
    );
  }

  if (isSemOperadorIntent) {
    return createTicketDecision(
      "listar_sem_operador",
      "listar_tickets_sem_operador",
      compactEntities({ status, area, departamento, cliente, prioridade, dataInicio, dataFim, limite, pagina }),
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
        compactEntities({
          status,
          departamento,
          operador,
          prioridade,
          limite,
          dataInicio,
          dataFim,
          ordem: ordemRanking,
        }),
      );
    }

    return createTicketDecision(
      "resumo_por_status",
      "resumo_tickets_por_status",
      compactEntities({
        area,
        departamento,
        operador,
        prioridade,
        limite,
        dataInicio,
        dataFim,
        ordem: ordemRanking,
      }),
    );
  }

  // Chegou até aqui sem nenhuma entidade "forte" extraída e sem nenhuma
  // palavra do vocabulário de tickets no texto — provavelmente a pergunta
  // não é sobre tickets (achado P1 da auditoria end-to-end). "operador"
  // sozinho não conta como entidade forte aqui: desde a unificação com
  // extractOperatorName (achado P5), esse campo pode vir de um "do/da"/
  // "por/pelo" bem genérico (ex.: "previsão DO TEMPO" capturava operador:
  // "tempo") — sem outro sinal de domínio, isso não é evidência confiável
  // de que a pergunta é sobre tickets. Número solto (ex.: "1002") fica de
  // fora de propósito: é ambíguo, mas plausivelmente uma referência a um
  // ticket, não claramente fora do domínio.
  const isBareNumber = /^\d+$/.test(text);
  const { operador: _operadorIgnoradoParaEsseCheck, ...entidadesFortes } = entities;

  if (
    Object.keys(entidadesFortes).length === 0
    && !isBareNumber
    && !TICKET_DOMAIN_VOCABULARY_PATTERN.test(text)
  ) {
    return createClarificationDecision(
      "fora_do_dominio",
      "Não entendi essa pergunta como algo relacionado aos tickets do sistema. "
        + "Você pode perguntar sobre status, prioridade, área, departamento, "
        + "operador, cliente, período ou número de um ticket, por exemplo.",
    );
  }

  return createTicketDecision(
    "listar",
    "listar_tickets",
    entities,
  );
}
