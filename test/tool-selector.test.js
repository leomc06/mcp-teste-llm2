import assert from "node:assert/strict";
import test from "node:test";

import {
  selectToolDecision,
  selectTools,
} from "../agent/tool-selector.js";

const ticketToolNames = [
  "buscar_ticket_por_numero",
  "listar_tickets",
  "resumo_tickets_por_status",
  "resumo_tickets_por_prioridade",
  "resumo_tickets_por_area",
  "listar_tickets_congelados",
  "listar_areas_tickets",
  "listar_status_tickets",
];

const availableTools = ticketToolNames.map((name) => ({
  function: {
    name,
  },
}));

const toolCases = [
  ["Busque o ticket 1001.", "buscar_ticket_por_numero"],
  ["Liste os tickets abertos.", "listar_tickets"],
  ["Resumo dos tickets por status.", "resumo_tickets_por_status"],
  ["Quantos tickets por prioridade?", "resumo_tickets_por_prioridade"],
  ["Resumo de tickets por área.", "resumo_tickets_por_area"],
  ["Quais tickets estão congelados?", "listar_tickets_congelados"],
  ["Quais áreas de ticket existem?", "listar_areas_tickets"],
];

for (const [pergunta, expectedTool] of toolCases) {
  test(`seleciona ${expectedTool} para: ${pergunta}`, () => {
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

test("filtra pelas tools realmente disponibilizadas", () => {
  const limitedTools = availableTools.filter(
    (tool) => tool.function.name !== "buscar_ticket_por_numero",
  );

  const decision = selectToolDecision(
    "Busque o ticket 1001.",
    limitedTools,
  );

  assert.deepEqual(
    decision.route.toolNames,
    ["buscar_ticket_por_numero"],
  );

  assert.deepEqual(decision.tools, []);
});

test("entidades extraídas da pergunta chegam na decisão", () => {
  const decision = selectToolDecision(
    "Liste os tickets da área de Redes com status Aguardando atendimento.",
    availableTools,
  );

  assert.equal(decision.route.entity, "ticket");
  assert.equal(decision.route.entities.area, "Redes");
  assert.equal(decision.route.entities.status, "Aguardando atendimento");

  assert.equal(
    decision.tools[0]?.function.name,
    "listar_tickets",
  );
});
