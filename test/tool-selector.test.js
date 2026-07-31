import assert from "node:assert/strict";
import test from "node:test";

import {
  selectToolDecision,
  selectTools,
} from "../agent/tool-selector.js";

const osToolNames = [
  "buscar_os_por_numero",
  "listar_os_abertas",
  "listar_os_atrasadas",
  "listar_os_por_responsavel",
  "listar_os_por_solicitante",
  "consultar_historico_os",
  "resumo_os_por_status",
  "resumo_os_por_prioridade",
  "listar_os_por_status",
];

const availableTools = osToolNames.map((name) => ({
  function: {
    name,
  },
}));

for (const pergunta of [
  "me mostre a OS com numero 1001",
  "Me mostre a OS com o número 1001",
  "Consulte a OS 1001",
  "Consulte a ordem de serviço de número 1001",
]) {
  test(`seleciona busca de OS para: ${pergunta}`, () => {
    assert.equal(
      selectTools(
        pergunta,
        availableTools,
      )[0]?.function.name,
      "buscar_os_por_numero",
    );
  });
}

for (const pergunta of [
  "Consulte as OS canceladas.",
  "Liste as OS concluídas.",
  "Mostre as OS aguardando.",
  "Consulte as OS em andamento.",
  "Liste as OS com status aberta.",
]) {
  test(`seleciona listagem por status para: ${pergunta}`, () => {
    assert.equal(
      selectTools(
        pergunta,
        availableTools,
      )[0]?.function.name,
      "listar_os_por_status",
    );
  });
}

const toolCases = [
  [
    "Quais OS estão pendentes?",
    "listar_os_abertas",
  ],
  [
    "Quais chamados estão vencidos?",
    "listar_os_atrasadas",
  ],
  [
    "Liste as OS do responsável Carlos.",
    "listar_os_por_responsavel",
  ],
  [
    "Liste as OS solicitadas pela Ana.",
    "listar_os_por_solicitante",
  ],
  [
    "Mostre o histórico da OS 1002.",
    "consultar_historico_os",
  ],
  [
    "Quantas OS estão concluídas?",
    "resumo_os_por_status",
  ],
  [
    "Quantas OS críticas existem?",
    "resumo_os_por_prioridade",
  ],
];

for (const [pergunta, expectedTool] of toolCases) {
  test(`seleciona ${expectedTool}`, () => {
    const selected = selectTools(
      pergunta,
      availableTools,
    );

    assert.equal(selected.length, 1);

    assert.equal(
      selected[0].function.name,
      expectedTool,
    );
  });
}

test("expõe fallback sem selecionar tools silenciosamente", () => {
  const decision = selectToolDecision(
    "Mostre informações sobre as OS.",
    availableTools,
  );

  assert.deepEqual(decision.tools, []);

  assert.equal(
    decision.route.intent,
    "clarification",
  );

  assert.equal(
    decision.route.fallback,
    true,
  );

  assert.ok(
    decision.route.clarification,
  );
});

test("não classifica consulta de clientes como OS", () => {
  const clientTools = [
    {
      function: {
        name: "listar_clientes",
      },
    },
    ...availableTools,
  ];

  const decision = selectToolDecision(
    "Liste todos os clientes.",
    clientTools,
  );

  assert.equal(decision.route, null);

  assert.equal(
    decision.tools[0]?.function.name,
    "listar_clientes",
  );
});
