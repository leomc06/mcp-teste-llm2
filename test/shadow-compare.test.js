import assert from "node:assert/strict";
import test from "node:test";

import { decisionsConcordam, describeLlmDecision, describeRegexDecision } from "../agent/shadow-compare.js";

test("describeRegexDecision: esclarecimento", () => {
  assert.deepEqual(describeRegexDecision({ clarification: "texto", intent: "esclarecimento_termo_ambiguo" }), {
    tipo: "esclarecimento",
    intent: "esclarecimento_termo_ambiguo",
  });
});

test("describeRegexDecision: compare", () => {
  assert.deepEqual(
    describeRegexDecision({
      compare: [
        { toolName: "analisar_carga_operador", args: {} },
        { toolName: "analisar_carga_operador", args: {} },
      ],
    }),
    { tipo: "compare", tools: ["analisar_carga_operador", "analisar_carga_operador"] },
  );
});

test("describeRegexDecision: 1 tool só", () => {
  assert.deepEqual(describeRegexDecision({ toolNames: ["listar_tickets"] }), {
    tipo: "tool",
    tool: "listar_tickets",
  });
});

test("describeRegexDecision: sem rota (defensivo)", () => {
  assert.deepEqual(describeRegexDecision(null), { tipo: "fallback_sem_rota" });
});

test("describeLlmDecision: tool", () => {
  assert.deepEqual(describeLlmDecision({ toolName: "listar_tickets", args: {} }), {
    tipo: "tool",
    tool: "listar_tickets",
  });
});

test("describeLlmDecision: compare", () => {
  assert.deepEqual(
    describeLlmDecision({
      compare: [
        { toolName: "buscar_ticket_por_numero", args: { numero: 100 } },
        { toolName: "buscar_ticket_por_numero", args: { numero: 200 } },
      ],
    }),
    { tipo: "compare", tools: ["buscar_ticket_por_numero", "buscar_ticket_por_numero"] },
  );
});

test("describeLlmDecision: resposta livre (sem tool)", () => {
  assert.deepEqual(describeLlmDecision({ resposta: "Pode esclarecer?" }), { tipo: "resposta_livre" });
});

test("decisionsConcordam: mesma tool nos dois lados", () => {
  assert.equal(
    decisionsConcordam({ tipo: "tool", tool: "listar_tickets" }, { tipo: "tool", tool: "listar_tickets" }),
    true,
  );
});

test("decisionsConcordam: tool diferente nos dois lados", () => {
  assert.equal(
    decisionsConcordam({ tipo: "tool", tool: "listar_tickets" }, { tipo: "tool", tool: "listar_tickets_abertos" }),
    false,
  );
});

test("decisionsConcordam: esclarecimento (regex) == resposta_livre (LLM) é concordância", () => {
  assert.equal(
    decisionsConcordam({ tipo: "esclarecimento", intent: "fora_do_dominio" }, { tipo: "resposta_livre" }),
    true,
  );
});

test("decisionsConcordam: compare com as mesmas tools na mesma ordem", () => {
  assert.equal(
    decisionsConcordam(
      { tipo: "compare", tools: ["analisar_carga_operador", "analisar_carga_operador"] },
      { tipo: "compare", tools: ["analisar_carga_operador", "analisar_carga_operador"] },
    ),
    true,
  );
});

test("decisionsConcordam: compare com quantidade de itens diferente", () => {
  assert.equal(
    decisionsConcordam(
      { tipo: "compare", tools: ["buscar_ticket_por_numero", "buscar_ticket_por_numero"] },
      { tipo: "compare", tools: ["buscar_ticket_por_numero", "buscar_ticket_por_numero", "buscar_ticket_por_numero"] },
    ),
    false,
  );
});

test("decisionsConcordam: tool (regex) vs compare (LLM) é divergência", () => {
  assert.equal(
    decisionsConcordam(
      { tipo: "tool", tool: "analisar_carga_operador" },
      { tipo: "compare", tools: ["analisar_carga_operador", "analisar_carga_operador"] },
    ),
    false,
  );
});
