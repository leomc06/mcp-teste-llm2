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

export function extractLimit(value) {
  const text = normalizeText(value);

  const patterns = [
    /\blimite(?:\s+de)?\s+(\d+)\b/,
    /\bno maximo(?:\s+de)?\s+(\d+)\s+(?:resultado|resultados|registro|registros|ticket|tickets)\b/,
    /\bprimeir(?:o|os|a|as)\s+(\d+)\s+(?:resultado|resultados|registro|registros|ticket|tickets)\b/,
    /\bate\s+(\d+)\s+(?:resultado|resultados|registro|registros|ticket|tickets)\b/,
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
