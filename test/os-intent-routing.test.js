import assert from "node:assert/strict";
import test from "node:test";

import {
  routeOsQuestion,
} from "../agent/os-routing.js";

const routingCases = [
  {
    question: "Mostre o histórico da OS 1002.",
    tool: "consultar_historico_os",
    intent: "consultar_historico",
  },
  {
    question: "Quem cancelou a OS 1004?",
    tool: "consultar_historico_os",
    intent: "consultar_historico",
  },
  {
    question: "Mostre a OS 1002.",
    tool: "buscar_os_por_numero",
    intent: "buscar_por_numero",
  },
  {
    question: "Consulte o chamado 1002.",
    tool: "buscar_os_por_numero",
    intent: "buscar_por_numero",
  },
  {
    question: "Quantas OS estão canceladas?",
    tool: "resumo_os_por_status",
    intent: "resumo_por_status",
  },
  {
    question: "Mostre a distribuição das OS por status.",
    tool: "resumo_os_por_status",
    intent: "resumo_por_status",
  },
  {
    question: "Quantas OS críticas existem?",
    tool: "resumo_os_por_prioridade",
    intent: "resumo_por_prioridade",
  },
  {
    question: "Mostre a distribuição das OS por prioridade.",
    tool: "resumo_os_por_prioridade",
    intent: "resumo_por_prioridade",
  },
  {
    question: "Liste as OS atrasadas.",
    tool: "listar_os_atrasadas",
    intent: "listar_atrasadas",
  },
  {
    question: "Quais chamados estão vencidos?",
    tool: "listar_os_atrasadas",
    intent: "listar_atrasadas",
  },
  {
    question: "Liste as OS solicitadas pela Ana.",
    tool: "listar_os_por_solicitante",
    intent: "listar_por_solicitante",
  },
  {
    question: "Quais OS foram abertas pela Ana?",
    tool: "listar_os_por_solicitante",
    intent: "listar_por_solicitante",
  },
  {
    question: "Liste as OS do responsável Carlos.",
    tool: "listar_os_por_responsavel",
    intent: "listar_por_responsavel",
  },
  {
    question: "Mostre os chamados atendidos pela Maria.",
    tool: "listar_os_por_responsavel",
    intent: "listar_por_responsavel",
  },
  {
    question: "Liste as OS canceladas.",
    tool: "listar_os_por_status",
    intent: "listar_por_status",
  },
  {
    question: "Mostre os chamados concluídos.",
    tool: "listar_os_por_status",
    intent: "listar_por_status",
  },
  {
    question: "Quais ordens estão aguardando?",
    tool: "listar_os_por_status",
    intent: "listar_por_status",
  },
  {
    question: "Quais OS estão em atendimento?",
    tool: "listar_os_por_status",
    intent: "listar_por_status",
  },
  {
    question: "Quais chamados estão pendentes?",
    tool: "listar_os_abertas",
    intent: "listar_abertas",
  },
  {
    question: "Mostre as ordens ainda não concluídas.",
    tool: "listar_os_abertas",
    intent: "listar_abertas",
  },
];

for (const {
  question,
  tool,
  intent,
} of routingCases) {
  test(`roteia: ${question}`, () => {
    const decision = routeOsQuestion(question);

    assert.ok(decision, question);
    assert.equal(decision.intent, intent, question);
    assert.deepEqual(decision.toolNames, [tool], question);
    assert.equal(decision.fallback, false, question);
  });
}

test("histórico prevalece sobre busca por número", () => {
  const decision = routeOsQuestion(
    "Mostre as movimentações da OS 1002.",
  );

  assert.equal(
    decision.intent,
    "consultar_historico",
  );

  assert.deepEqual(
    decision.toolNames,
    ["consultar_historico_os"],
  );

  assert.equal(decision.entities.numero, 1002);
});

test("contagem prevalece sobre listagem por status", () => {
  const decision = routeOsQuestion(
    "Quantas OS canceladas existem?",
  );

  assert.equal(
    decision.intent,
    "resumo_por_status",
  );

  assert.deepEqual(
    decision.toolNames,
    ["resumo_os_por_status"],
  );

  assert.equal(
    decision.entities.status,
    "cancelada",
  );
});

test("solicitante prevalece sobre status aberta", () => {
  const decision = routeOsQuestion(
    "Liste as OS abertas pela Ana.",
  );

  assert.equal(
    decision.intent,
    "listar_por_solicitante",
  );

  assert.deepEqual(
    decision.toolNames,
    ["listar_os_por_solicitante"],
  );

  assert.equal(
    decision.entities.status,
    "aberta",
  );
});

test("atraso preserva prioridade canônica", () => {
  const decision = routeOsQuestion(
    "Liste as OS críticas atrasadas.",
  );

  assert.equal(
    decision.intent,
    "listar_atrasadas",
  );

  assert.equal(
    decision.entities.prioridade,
    "critica",
  );
});

test("status e prioridade incompatíveis pedem esclarecimento", () => {
  const decision = routeOsQuestion(
    "Liste as OS canceladas de prioridade alta.",
  );

  assert.equal(decision.intent, "clarification");
  assert.deepEqual(decision.toolNames, []);
  assert.equal(decision.fallback, true);
  assert.equal(decision.entities.status, "cancelada");
  assert.equal(decision.entities.prioridade, "alta");
});

test("histórico sem número pede esclarecimento", () => {
  const decision = routeOsQuestion(
    "Mostre o histórico das OS.",
  );

  assert.equal(decision.intent, "clarification");
  assert.deepEqual(decision.toolNames, []);
  assert.equal(decision.fallback, true);
  assert.match(decision.clarification, /número da OS/i);
});

test("prioridade sem listagem compatível pede esclarecimento", () => {
  const decision = routeOsQuestion(
    "Liste as OS críticas.",
  );

  assert.equal(decision.intent, "clarification");
  assert.deepEqual(decision.toolNames, []);
  assert.equal(decision.fallback, true);
  assert.equal(decision.entities.prioridade, "critica");
});

test("pergunta genérica sobre OS não retorna vazio silencioso", () => {
  const decision = routeOsQuestion(
    "Mostre informações sobre as OS.",
  );

  assert.equal(decision.intent, "clarification");
  assert.deepEqual(decision.toolNames, []);
  assert.equal(decision.fallback, true);
  assert.ok(decision.clarification);
});

test("pergunta de clientes não é classificada como OS", () => {
  assert.equal(
    routeOsQuestion("Liste os clientes cancelados."),
    null,
  );
});

test("solicitante sem nome pede esclarecimento", () => {
  const decision = routeOsQuestion(
    "Liste as OS por solicitante.",
  );

  assert.equal(decision.intent, "clarification");
  assert.deepEqual(decision.toolNames, []);
  assert.equal(decision.fallback, true);
  assert.match(
    decision.clarification,
    /nome do solicitante/i,
  );
});

test("responsável sem nome pede esclarecimento", () => {
  const decision = routeOsQuestion(
    "Liste as OS por responsável.",
  );

  assert.equal(decision.intent, "clarification");
  assert.deepEqual(decision.toolNames, []);
  assert.equal(decision.fallback, true);
  assert.match(
    decision.clarification,
    /nome do responsável/i,
  );
});
