import assert from "node:assert/strict";
import test from "node:test";

import {
  buildToolArguments,
} from "../agent/os-routing.js";

const statusEnum = [
  "aberta",
  "em_andamento",
  "aguardando",
  "concluida",
  "cancelada",
];

const priorityEnum = [
  "baixa",
  "media",
  "alta",
  "critica",
];

const daysSchema = {
  type: "integer",
  minimum: 1,
  maximum: 3650,
  default: 365,
};

const listLimitSchema = {
  type: "integer",
  minimum: 1,
  maximum: 50,
  default: 20,
};

const historyLimitSchema = {
  type: "integer",
  minimum: 1,
  maximum: 100,
  default: 50,
};

function tool(name, properties, required = []) {
  return {
    function: {
      name,
      parameters: {
        type: "object",
        properties,
        required,
      },
    },
  };
}

const availableTools = [
  tool(
    "buscar_os_por_numero",
    {
      numero: {
        type: "integer",
        exclusiveMinimum: 0,
        maximum: 2147483647,
      },
    },
    ["numero"],
  ),

  tool(
    "listar_os_abertas",
    {
      responsavel: {
        type: "string",
        minLength: 1,
        maxLength: 150,
      },
      prioridade: {
        type: "string",
        enum: priorityEnum,
      },
      limite: listLimitSchema,
    },
  ),

  tool(
    "listar_os_atrasadas",
    {
      responsavel: {
        type: "string",
        minLength: 1,
        maxLength: 150,
      },
      prioridade: {
        type: "string",
        enum: priorityEnum,
      },
      dias: daysSchema,
      limite: listLimitSchema,
    },
  ),

  tool(
    "listar_os_por_responsavel",
    {
      responsavel: {
        type: "string",
        minLength: 1,
        maxLength: 150,
      },
      status: {
        type: "string",
        enum: statusEnum,
      },
      dias: daysSchema,
      limite: listLimitSchema,
    },
    ["responsavel"],
  ),

  tool(
    "listar_os_por_solicitante",
    {
      solicitante: {
        type: "string",
        minLength: 1,
        maxLength: 150,
      },
      status: {
        type: "string",
        enum: statusEnum,
      },
      dias: daysSchema,
      limite: listLimitSchema,
    },
    ["solicitante"],
  ),

  tool(
    "consultar_historico_os",
    {
      numero: {
        type: "integer",
        exclusiveMinimum: 0,
        maximum: 2147483647,
      },
      dias: {
        ...daysSchema,
        default: 3650,
      },
      limite: historyLimitSchema,
    },
    ["numero"],
  ),

  tool(
    "resumo_os_por_status",
    {
      dias: daysSchema,
    },
  ),

  tool(
    "resumo_os_por_prioridade",
    {
      dias: daysSchema,
    },
  ),

  tool(
    "listar_os_por_status",
    {
      status: {
        type: "string",
        enum: statusEnum,
      },
      dias: daysSchema,
      limite: listLimitSchema,
    },
    ["status"],
  ),
];

test("constrói argumentos de busca por número", () => {
  const result = buildToolArguments(
    "buscar_os_por_numero",
    {
      numero: 1002,
      status: "cancelada",
      prioridade: "alta",
    },
    availableTools,
  );

  assert.equal(result.ok, true);

  assert.deepEqual(result.args, {
    numero: 1002,
  });

  assert.deepEqual(result.errors, []);
});

test("preserva somente filtros aceitos pela tool", () => {
  const result = buildToolArguments(
    "listar_os_atrasadas",
    {
      responsavel: "Carlos",
      prioridade: "critica",
      status: "cancelada",
      dias: 30,
      limite: 10,
      campoInventado: "valor",
    },
    availableTools,
  );

  assert.equal(result.ok, true);

  assert.deepEqual(result.args, {
    responsavel: "Carlos",
    prioridade: "critica",
    dias: 30,
    limite: 10,
  });
});

test("constrói argumentos por responsável", () => {
  const result = buildToolArguments(
    "listar_os_por_responsavel",
    {
      responsavel: "João da Silva",
      status: "concluida",
      dias: 60,
    },
    availableTools,
  );

  assert.equal(result.ok, true);

  assert.deepEqual(result.args, {
    responsavel: "João da Silva",
    status: "concluida",
    dias: 60,
  });
});

test("constrói argumentos por solicitante", () => {
  const result = buildToolArguments(
    "listar_os_por_solicitante",
    {
      solicitante: "Ana Costa",
      status: "aberta",
      limite: 15,
    },
    availableTools,
  );

  assert.equal(result.ok, true);

  assert.deepEqual(result.args, {
    solicitante: "Ana Costa",
    status: "aberta",
    limite: 15,
  });
});

test("não envia null nem campos opcionais inválidos", () => {
  const result = buildToolArguments(
    "listar_os_atrasadas",
    {
      responsavel: null,
      prioridade: null,
      dias: 0,
      limite: 0,
    },
    availableTools,
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.args, {});

  assert.deepEqual(
    result.errors.map((error) => error.field),
    [
      "responsavel",
      "prioridade",
      "dias",
      "limite",
    ],
  );
});

test("rejeita limite acima do máximo da tool", () => {
  const result = buildToolArguments(
    "listar_os_por_status",
    {
      status: "cancelada",
      limite: 100,
    },
    availableTools,
  );

  assert.equal(result.ok, false);

  assert.deepEqual(result.args, {
    status: "cancelada",
  });

  assert.deepEqual(result.errors, [
    {
      field: "limite",
      code: "invalid_value",
    },
  ]);
});

test("rejeita status não canônico", () => {
  const result = buildToolArguments(
    "listar_os_por_status",
    {
      status: "concluída",
    },
    availableTools,
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.args, {});

  assert.deepEqual(result.errors, [
    {
      field: "status",
      code: "invalid_value",
    },
  ]);
});

test("detecta campo obrigatório ausente", () => {
  const result = buildToolArguments(
    "listar_os_por_solicitante",
    {
      dias: 30,
    },
    availableTools,
  );

  assert.equal(result.ok, false);

  assert.deepEqual(result.args, {
    dias: 30,
  });

  assert.deepEqual(result.errors, [
    {
      field: "solicitante",
      code: "required_field_missing",
    },
  ]);
});

test("não aplica defaults que não foram solicitados", () => {
  const result = buildToolArguments(
    "listar_os_por_status",
    {
      status: "aguardando",
    },
    availableTools,
  );

  assert.equal(result.ok, true);

  assert.deepEqual(result.args, {
    status: "aguardando",
  });
});

test("rejeita tool indisponível", () => {
  const result = buildToolArguments(
    "tool_inexistente",
    {},
    availableTools,
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.args, {});

  assert.deepEqual(result.errors, [
    {
      field: null,
      code: "tool_not_available",
    },
  ]);
});
