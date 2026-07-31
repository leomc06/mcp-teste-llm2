import assert from "node:assert/strict";
import test from "node:test";

import {
  routeOsQuestion,
} from "../agent/os-routing.js";

const combinationCases = [
  {
    question:
      "Liste as OS críticas atrasadas do Carlos nos últimos 30 dias com limite 10.",
    tool: "listar_os_atrasadas",
    intent: "listar_atrasadas",
    entities: {
      prioridade: "critica",
      responsavel: "Carlos",
      dias: 30,
      limite: 10,
    },
  },
  {
    question:
      "Liste as OS abertas do responsável Carlos com prioridade alta e limite 10.",
    tool: "listar_os_abertas",
    intent: "listar_abertas",
    entities: {
      status: "aberta",
      prioridade: "alta",
      responsavel: "Carlos",
      limite: 10,
    },
  },
  {
    question:
      "Liste as OS canceladas solicitadas pela Ana nos últimos 30 dias com limite 10.",
    tool: "listar_os_por_solicitante",
    intent: "listar_por_solicitante",
    entities: {
      status: "cancelada",
      solicitante: "Ana",
      dias: 30,
      limite: 10,
    },
  },
  {
    question:
      "Liste as OS concluídas do responsável João nos últimos 60 dias.",
    tool: "listar_os_por_responsavel",
    intent: "listar_por_responsavel",
    entities: {
      status: "concluida",
      responsavel: "João",
      dias: 60,
    },
  },
  {
    question:
      "Liste as OS do solicitante Maria nos últimos 30 dias.",
    tool: "listar_os_por_solicitante",
    intent: "listar_por_solicitante",
    entities: {
      solicitante: "Maria",
      dias: 30,
    },
  },
  {
    question:
      "Mostre o histórico da OS 1004 nos últimos 90 dias com limite 25.",
    tool: "consultar_historico_os",
    intent: "consultar_historico",
    entities: {
      numero: 1004,
      dias: 90,
      limite: 25,
    },
  },
  {
    question:
      "Qual é o status da OS 1002?",
    tool: "buscar_os_por_numero",
    intent: "buscar_por_numero",
    entities: {
      numero: 1002,
    },
  },
  {
    question:
      "Mostre o resumo das OS por status nos últimos 90 dias.",
    tool: "resumo_os_por_status",
    intent: "resumo_por_status",
    entities: {
      dias: 90,
    },
  },
  {
    question:
      "Mostre a distribuição das OS por prioridade nos últimos 6 meses.",
    tool: "resumo_os_por_prioridade",
    intent: "resumo_por_prioridade",
    entities: {
      dias: 180,
    },
  },
];

for (const {
  question,
  tool,
  intent,
  entities,
} of combinationCases) {
  test(`preserva filtros combinados: ${question}`, () => {
    const decision = routeOsQuestion(question);

    assert.ok(decision, question);
    assert.equal(decision.fallback, false, question);
    assert.equal(decision.intent, intent, question);
    assert.deepEqual(decision.toolNames, [tool], question);

    for (
      const [field, expectedValue]
      of Object.entries(entities)
    ) {
      assert.equal(
        decision.entities[field],
        expectedValue,
        `${question} - campo ${field}`,
      );
    }

    assert.equal(
      Object.values(decision.entities).some(
        (value) =>
          value === null
          || value === undefined,
      ),
      false,
      question,
    );
  });
}

const statusCases = [
  [
    "Liste as OS com status aberta.",
    "aberta",
  ],
  [
    "Liste as OS em andamento.",
    "em_andamento",
  ],
  [
    "Liste as OS em espera.",
    "aguardando",
  ],
  [
    "Liste as OS resolvidas.",
    "concluida",
  ],
  [
    "Liste as ordens anuladas.",
    "cancelada",
  ],
];

for (const [question, expectedStatus] of statusCases) {
  test(`roteia status canônico ${expectedStatus}`, () => {
    const decision = routeOsQuestion(question);

    assert.equal(
      decision.intent,
      "listar_por_status",
      question,
    );

    assert.deepEqual(
      decision.toolNames,
      ["listar_os_por_status"],
      question,
    );

    assert.equal(
      decision.entities.status,
      expectedStatus,
      question,
    );
  });
}

const priorityCases = [
  [
    "Quantas OS de prioridade baixa existem?",
    "baixa",
  ],
  [
    "Quantas OS de prioridade média existem?",
    "media",
  ],
  [
    "Quantas OS de prioridade alta existem?",
    "alta",
  ],
  [
    "Quantas OS de prioridade crítica existem?",
    "critica",
  ],
];

for (
  const [question, expectedPriority]
  of priorityCases
) {
  test(`roteia prioridade canônica ${expectedPriority}`, () => {
    const decision = routeOsQuestion(question);

    assert.equal(
      decision.intent,
      "resumo_por_prioridade",
      question,
    );

    assert.deepEqual(
      decision.toolNames,
      ["resumo_os_por_prioridade"],
      question,
    );

    assert.equal(
      decision.entities.prioridade,
      expectedPriority,
      question,
    );
  });
}

const clarificationCases = [
  {
    question:
      "Liste as OS canceladas de prioridade alta.",
    fields: {
      status: "cancelada",
      prioridade: "alta",
    },
  },
  {
    question:
      "Liste as OS solicitadas pela Ana de prioridade alta.",
    fields: {
      solicitante: "Ana",
      prioridade: "alta",
    },
  },
  {
    question:
      "Liste as OS do responsável Carlos de prioridade alta.",
    fields: {
      responsavel: "Carlos",
      prioridade: "alta",
    },
  },
  {
    question:
      "Mostre o histórico das OS.",
    fields: {},
  },
  {
    question:
      "Mostre informações sobre as OS.",
    fields: {},
  },
];

for (const {
  question,
  fields,
} of clarificationCases) {
  test(`pede esclarecimento: ${question}`, () => {
    const decision = routeOsQuestion(question);

    assert.equal(
      decision.intent,
      "clarification",
      question,
    );

    assert.equal(
      decision.fallback,
      true,
      question,
    );

    assert.deepEqual(
      decision.toolNames,
      [],
      question,
    );

    assert.ok(
      decision.clarification,
      question,
    );

    for (
      const [field, expectedValue]
      of Object.entries(fields)
    ) {
      assert.equal(
        decision.entities[field],
        expectedValue,
        `${question} - campo ${field}`,
      );
    }
  });
}
