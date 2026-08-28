import assert from "node:assert/strict";
import test from "node:test";

import {
  extractAreaName,
  extractDepartmentName,
  extractOperatorName,
  extractPage,
  extractTicketNumber,
  extractTicketStatusName,
  routeTicketQuestion,
} from "../agent/tickets-routing.js";

test("extrai número de ticket", () => {
  assert.equal(extractTicketNumber("Busque o ticket 1001."), 1001);
  assert.equal(extractTicketNumber("Detalhe do ticket número 42."), 42);
  assert.equal(extractTicketNumber("Nenhum número aqui."), undefined);
});

test("extrai nome de área, departamento, operador e status de ticket", () => {
  assert.equal(extractAreaName("Liste os tickets da área de Redes."), "Redes");
  assert.equal(
    extractDepartmentName("Tickets do departamento Financeiro."),
    "Financeiro",
  );
  assert.equal(
    extractOperatorName("Tickets do operador João Silva."),
    "João Silva",
  );
  assert.equal(
    extractTicketStatusName("Tickets com status Aguardando atendimento."),
    "Aguardando atendimento",
  );
});

test("roteia busca de ticket por número", () => {
  const route = routeTicketQuestion("Busque o ticket 1001.");

  assert.deepEqual(route.toolNames, ["buscar_ticket_por_numero"]);
  assert.equal(route.entities.numero, 1001);
});

test("roteia resumo de tickets por status", () => {
  const route = routeTicketQuestion("Resumo dos tickets por status.");

  assert.deepEqual(route.toolNames, ["resumo_tickets_por_status"]);
});

test("roteia resumo de tickets por prioridade", () => {
  const route = routeTicketQuestion("Quantos tickets por prioridade?");

  assert.deepEqual(route.toolNames, ["resumo_tickets_por_prioridade"]);
});

test("roteia resumo de tickets por área", () => {
  const route = routeTicketQuestion("Resumo de tickets por área.");

  assert.deepEqual(route.toolNames, ["resumo_tickets_por_area"]);
});

test("roteia listagem de tickets congelados", () => {
  const route = routeTicketQuestion("Quais tickets estão congelados?");

  assert.deepEqual(route.toolNames, ["listar_tickets_congelados"]);
});

test("roteia listagem de áreas de ticket", () => {
  const route = routeTicketQuestion("Quais áreas de ticket existem?");

  assert.deepEqual(route.toolNames, ["listar_areas_tickets"]);
});

test("roteia listagem de status de ticket", () => {
  const route = routeTicketQuestion("Liste os status de ticket.");

  assert.deepEqual(route.toolNames, ["listar_status_tickets"]);
});

test("roteia listagem genérica de tickets com filtros extraídos", () => {
  const route = routeTicketQuestion(
    "Liste os tickets da área de Redes com status Aguardando atendimento.",
  );

  assert.deepEqual(route.toolNames, ["listar_tickets"]);
  assert.equal(route.entities.area, "Redes");
  assert.equal(route.entities.status, "Aguardando atendimento");
});

test("extrai número de página", () => {
  assert.equal(extractPage("Liste os tickets (página 2)."), 2);
  assert.equal(extractPage("Mostre a página 15 dos tickets abertos."), 15);
  assert.equal(extractPage("Liste os tickets."), undefined);
});

test("quando há mais de uma menção de página, usa a última (permite sobrescrever)", () => {
  assert.equal(
    extractPage("Mostre a página 3 dos tickets abertos (página 4)."),
    4,
  );
});

test("roteia listagem de tickets com número de página", () => {
  const route = routeTicketQuestion("Liste os tickets abertos (página 2).");

  assert.deepEqual(route.toolNames, ["listar_tickets"]);
  assert.equal(route.entities.pagina, 2);
});
