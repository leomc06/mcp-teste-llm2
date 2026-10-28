import { normalizeText } from "./routing-utils.js";
import {
  isBareFormatoRequest,
  OPEN_STATE_ADJECTIVE_SOURCE,
  CLOSURE_VERB_SOURCE,
} from "./tickets-routing.js";

// Continuação conversacional "meio-termo" (decisão com o usuário): texto
// livre só dispara quando a frase nova COMEÇA com um desses marcadores de
// alta confiança — não é NLU, é regex restrita, mesmo espírito do resto do
// roteador. Fora esses casos, o refinamento é só via chip/botão explícito
// (web/shapes.js:buildRefinementChips), que sempre gera uma pergunta já
// começando com um destes marcadores, garantindo o merge por construção.
//
// F4 (auditoria de robustez): faltava a forma feminina ("e AS urgentes",
// só existia "e os"/"só os" no masculino), "agora"/"agora só" (jeito comum
// de iniciar um refinamento falado) e "quantas são?"/"quantos é?" (pergunta
// de acompanhamento bem comum, sem repetir nenhum filtro).
// "e por X" (achado testando continuação multi-turno ao vivo): jeito bem
// comum de pedir um RE-agrupamento por outra dimensão em cima do mesmo
// contexto ("Resumo por área" → "e por prioridade?") — sem esse marcador,
// "e por prioridade?" não era reconhecida como continuação nenhuma, virava
// uma pergunta nova do zero (perdia todo o filtro/período acumulado).
const PLURAL_ARTICLE_SOURCE = "(?:os|as)";

// "E fechados?" (achado testando o lote de perguntas ao vivo): elipse de
// continuação SEM artigo — diferente de "E os fechados?" (já reconhecido
// acima), aqui o adjetivo de situação vem direto depois do "e", sem "os"/
// "as" no meio. Reaproveita o MESMO vocabulário de situação já usado em
// tickets-routing.js (OPEN_STATE_ADJECTIVE_SOURCE/CLOSURE_VERB_SOURCE) em
// vez de uma lista própria, pra nunca dessincronizar quando um sinônimo
// novo entrar num lado só. Deliberadamente restrito a esse vocabulário
// (não "e <qualquer palavra>?") pra não arriscar tratar uma pergunta nova
// e não relacionada como continuação só por começar com "E ".
const BARE_SITUACAO_SOURCE = `(?:${OPEN_STATE_ADJECTIVE_SOURCE}|${CLOSURE_VERB_SOURCE})`;

const CONTINUATION_LEADING_MARKERS = [
  /^e\s+desses\b/,
  /^desses\b/,
  new RegExp(`^e\\s+${PLURAL_ARTICLE_SOURCE}\\b`),
  new RegExp(`^s[óo]\\s+${PLURAL_ARTICLE_SOURCE}\\b`),
  new RegExp(`^apenas\\s+${PLURAL_ARTICLE_SOURCE}\\b`),
  /^e\s+quanto\s+a(?:os?)?\b/,
  /^e\s+por\b/,
  // "E como cliente?" (achado testando o lote de perguntas ao vivo — Lote
  // 9, pergunta 17): troca de dimensão SEM repetir o nome, depois de
  // perguntar sobre carga/atividade de alguém que é cliente E operador ao
  // mesmo tempo (achado real do Lote 8) — "e por" já cobre troca de
  // dimensão de AGRUPAMENTO ("por área" → "por prioridade"), mas não essa
  // forma com "como" (qualificador de papel/dimensão da PESSOA, não de
  // agrupamento). Sem este marcador, a frase isolada ("E como cliente?",
  // sem nenhum nome) caía direto no fallback final de listar_tickets SEM
  // FILTRO NENHUM, despejando o sistema inteiro.
  /^e\s+como\b/,
  /^agora\b/,
  /^quant[ao]s?\s+(?:sao|e)\b/,
  new RegExp(`^e\\s+${BARE_SITUACAO_SOURCE}\\b`),
];

export function detectsContinuation(pergunta) {
  const text = normalizeText(pergunta);

  return CONTINUATION_LEADING_MARKERS.some((pattern) => pattern.test(text)) || isBareFormatoRequest(pergunta);
}

// Concatenação pura de texto — a frase combinada é re-roteada do zero por
// routeTicketQuestion (função pura de uma string só, não ganha um 2º
// parâmetro). Duas menções contraditórias da mesma dimensão (ex.: área X no
// turno 1, área Y no turno 2) resolvem exatamente como já resolveriam se o
// usuário tivesse escrito as duas na mesma frase manualmente — continuação
// não introduz nenhuma ambiguidade nova.
export function mergeContinuation(perguntaAnterior, pergunta) {
  return `${perguntaAnterior.trim()} ${pergunta.trim()}`;
}
