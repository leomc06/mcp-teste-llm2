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

// Números por extenso (achado testando o lote de perguntas ao vivo): "Liste
// os DEZ tickets mais antigos..." não reconhecia nenhum limite, porque
// nenhum padrão abaixo aceitava algo que não fosse dígito — só cobre 1 a 20
// (faixa mais comum em "top N"/"primeiros N", números maiores quase sempre
// aparecem como dígito mesmo na fala real).
const NUMBER_WORDS = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
};

const NUMBER_WORD_PATTERN = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join("|")})\\b`, "gu");

// Exportada (não só usada internamente por extractLimit) porque
// extractLooseNumberMatch em tickets-routing.js também precisa dela — "dez
// tickets mais antigos" (sem "primeiros"/"top"/"com mais") só tem número
// extraído ali, não pelos padrões específicos acima.
export function substituiNumerosPorExtenso(text) {
  return text.replace(NUMBER_WORD_PATTERN, (match) => String(NUMBER_WORDS[match]));
}

export function extractLimit(value) {
  const text = substituiNumerosPorExtenso(normalizeText(value));

  const patterns = [
    /\blimite(?:\s+de)?\s+(\d+)\b/,
    /\bno maximo(?:\s+de)?\s+(\d+)\s+(?:resultado|resultados|registro|registros|ticket|tickets)\b/,
    /\bprimeir(?:o|os|a|as)\s+(\d+)\s+(?:resultado|resultados|registro|registros|ticket|tickets)\b/,
    // "só os 5 primeiros" (achado testando o lote de perguntas ao vivo):
    // ordem invertida ("N primeiros", sem nenhum substantivo depois) — o
    // padrão acima exige "primeiros N <substantivo>", então essa forma
    // mais curta e comum na fala (quando já ficou claro do que se trata
    // pelo resto da frase) nunca batia.
    /\b(\d+)\s+primeir(?:o|os|a|as)\b/,
    /\bate\s+(\d+)\s+(?:resultado|resultados|registro|registros|ticket|tickets)\b/,
    /\btop\s+(\d+)\b/,
    // "os 3 operadores com mais tickets"/"as 5 áreas com menos chamados"
    // (achado testando o lote de perguntas ao vivo — Complexas 1, pergunta
    // 1): jeito comum de pedir um "top N" sem usar a palavra "top" — sem
    // isso, "Quais os 3 operadores com mais tickets fechados..." ignorava o
    // "3" e devolvia TODOS os operadores do resumo, não só os 3 pedidos.
    /\b(\d+)\s+\p{L}+\s+com\s+(?:mais|menos)\b/u,
    // "os 3 operadores QUE mais fecharam" (achado testando o lote de
    // perguntas ao vivo): mesma ideia do padrão acima, só com "que" no
    // lugar de "com" (ex.: "que mais fecharam/atenderam/trataram", um verbo
    // de ação em vez de "com mais tickets").
    /\b(\d+)\s+\p{L}+\s+que\s+(?:mais|menos)\b/u,
    // "os 3 piores operadores"/"as 2 melhores áreas" (achado testando o
    // lote de perguntas ao vivo): mesma ideia dos 2 padrões acima ("N
    // <dimensão> com/que mais/menos"), mas com o adjetivo ANTES do
    // substantivo, sem "com"/"que" nenhum no meio — "Lista os 3 PIORES
    // operadores em atendimento esse mês." ignorava o "3" por completo.
    /\b(\d+)\s+(?:pior(?:es)?|melhor(?:es)?)\s+\p{L}+\b/u,
    // "Liste 5 tickets abertos." (achado testando o lote de perguntas ao
    // vivo): número bare direto depois de um verbo de listagem, sem
    // "primeiros"/"top"/"com mais" — nenhum padrão acima cobria essa forma
    // (bem comum), e o "5" era descartado em silêncio, devolvendo o limite
    // padrão da tool em vez do pedido. Direção do número (ANTES da palavra
    // de ticket) evita colidir com "ticket 1050" (número de identificação,
    // não limite — ver extractTicketNumber, que lê a ordem inversa).
    /\b(?:list[ae]|mostr[ae]|exib[ae]|trag[ae])\w*\s+(\d+)\s+(?:tickets?|chamados?|atendimentos?)\b/u,
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

export function compactEntities(values) {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([, value]) => value !== undefined,
    ),
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

      // "min"/"max" (achado testando o lote de perguntas ao vivo): "Liste
      // os 1000 tickets mais antigos." (acima do máximo de 50 da tool)
      // virava uma mensagem genérica pro usuário ("Revise os seguintes
      // filtros: limite."), sem dizer QUAL é o limite aceito — repassa os
      // limites do próprio schema aqui, pra quem monta a mensagem final
      // (agent/server.js) poder ser específico, em vez de genérico.
      errors.push({
        field,
        code: "invalid_value",
        min: schema.minimum ?? schema.exclusiveMinimum,
        max: schema.maximum ?? schema.exclusiveMaximum,
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
