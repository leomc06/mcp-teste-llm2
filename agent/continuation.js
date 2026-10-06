import { normalizeText } from "./routing-utils.js";

// Continuação conversacional "meio-termo" (decisão com o usuário): texto
// livre só dispara quando a frase nova COMEÇA com um desses marcadores de
// alta confiança — não é NLU, é regex restrita, mesmo espírito do resto do
// roteador. Fora esses casos, o refinamento é só via chip/botão explícito
// (web/shapes.js:buildRefinementChips), que sempre gera uma pergunta já
// começando com um destes marcadores, garantindo o merge por construção.
const CONTINUATION_LEADING_MARKERS = [
  /^e\s+desses\b/,
  /^desses\b/,
  /^e\s+os\b/,
  /^s[óo]\s+os\b/,
  /^apenas\s+os\b/,
  /^e\s+quanto\s+a(?:os?)?\b/,
];

export function detectsContinuation(pergunta) {
  const text = normalizeText(pergunta);

  return CONTINUATION_LEADING_MARKERS.some((pattern) => pattern.test(text));
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
