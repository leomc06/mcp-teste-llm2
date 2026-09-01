import assert from "node:assert/strict";
import test from "node:test";

import {
  extractAreaName,
  extractDateRange,
  extractDepartmentName,
  extractOperatorName,
  extractPage,
  extractPriorityName,
  extractTicketNumber,
  extractTicketStatusName,
  extractUserName,
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

test("roteia resumo de tickets por operador", () => {
  const route = routeTicketQuestion("Quantos tickets por operador?");

  assert.deepEqual(route.toolNames, ["resumo_tickets_por_operador"]);
});

test("roteia resumo de tickets por departamento", () => {
  const route = routeTicketQuestion("Quantos tickets por departamento?");

  assert.deepEqual(route.toolNames, ["resumo_tickets_por_departamento"]);
});

test("resumo por operador com filtro de área não é capturado pela dimensão de área", () => {
  const route = routeTicketQuestion("Quantos tickets por operador na área de Suporte?");

  assert.deepEqual(route.toolNames, ["resumo_tickets_por_operador"]);
  assert.equal(route.entities.area, "Suporte");
});

test("pergunta sobre um operador específico não vira resumo por operador", () => {
  const route = routeTicketQuestion("Quantos tickets abertos existem do operador Ana?");

  assert.deepEqual(route.toolNames, ["listar_tickets_abertos"]);
  assert.equal(route.entities.operador, "Ana");
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

test("'usuário' funciona como sinônimo de operador na listagem genérica", () => {
  const route = routeTicketQuestion("me mostre os chamadas do usuario paulo");

  assert.deepEqual(route.toolNames, ["listar_tickets"]);
  assert.equal(route.entities.operador, "paulo");
});

test("roteia listagem genérica de tickets com filtros extraídos", () => {
  const route = routeTicketQuestion(
    "Liste os tickets da área de Redes com status Aguardando atendimento.",
  );

  assert.deepEqual(route.toolNames, ["listar_tickets"]);
  assert.equal(route.entities.area, "Redes");
  assert.equal(route.entities.status, "Aguardando atendimento");
});

test("extrai nome de prioridade", () => {
  assert.equal(extractPriorityName("Liste os tickets com prioridade Alta."), "Alta");
  assert.equal(extractPriorityName("Liste os tickets."), undefined);
});

test("roteia listagem de tickets filtrada por prioridade", () => {
  const route = routeTicketQuestion("Liste os tickets com prioridade Alta.");

  assert.deepEqual(route.toolNames, ["listar_tickets"]);
  assert.equal(route.entities.prioridade, "Alta");
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
  const route = routeTicketQuestion("Liste os tickets (página 2).");

  assert.deepEqual(route.toolNames, ["listar_tickets"]);
  assert.equal(route.entities.pagina, 2);
});

test("o sufixo de página não vaza para o nome da área quando não há pontuação antes dele", () => {
  const route = routeTicketQuestion(
    "Liste os tickets da área web (página 2)",
  );

  assert.deepEqual(route.toolNames, ["listar_tickets"]);
  assert.equal(route.entities.area, "web");
  assert.equal(route.entities.pagina, 2);
});

test("extrai nome de usuário de diferentes frases de busca", () => {
  assert.equal(
    extractUserName("Busque o usuário João Silva."),
    "João Silva",
  );
  assert.equal(
    extractUserName("Procure o usuário chamado Ana Costa."),
    "Ana Costa",
  );
  assert.equal(
    extractUserName("Quem é o usuário Carlos Souza?"),
    "Carlos Souza",
  );
  assert.equal(
    extractUserName("Informações do usuário Fernanda."),
    "Fernanda",
  );
  assert.equal(
    extractUserName("Quais usuários de ticket existem?"),
    undefined,
  );
});

test("roteia busca de usuário por nome", () => {
  const route = routeTicketQuestion("Busque o usuário João Silva.");

  assert.deepEqual(route.toolNames, ["buscar_usuarios_por_nome"]);
  assert.equal(route.entities.nome, "João Silva");
});

test("pergunta genérica sobre usuários continua indo para listar_usuarios_tickets", () => {
  const route = routeTicketQuestion("Quais usuários de ticket existem?");

  assert.deepEqual(route.toolNames, ["listar_usuarios_tickets"]);
});

test("roteia contagem de tickets abertos com operador extraído de 'por <nome>'", () => {
  const route = routeTicketQuestion("Quantos chamados estão abertos por Cesar?");

  assert.deepEqual(route.toolNames, ["listar_tickets_abertos"]);
  assert.equal(route.entities.operador, "Cesar");
});

test("roteia listagem de tickets abertos mais antigos", () => {
  const route = routeTicketQuestion("Quais os 5 tickets mais antigos ainda abertos?");

  assert.deepEqual(route.toolNames, ["listar_tickets_abertos_mais_antigos"]);
  assert.equal(route.entities.limite, 5);
});

test("roteia listagem de tickets sem operador atribuído", () => {
  const route = routeTicketQuestion("Quantos tickets estão sem operador atribuído?");

  assert.deepEqual(route.toolNames, ["listar_tickets_sem_operador"]);
});

test("roteia listagem de tickets não atribuídos", () => {
  const route = routeTicketQuestion("Liste os tickets não atribuídos na área de Suporte.");

  assert.deepEqual(route.toolNames, ["listar_tickets_sem_operador"]);
  assert.equal(route.entities.area, "Suporte");
});

test("roteia listagem de tickets fechados", () => {
  const route = routeTicketQuestion("Quais tickets estão fechados na área de Redes?");

  assert.deepEqual(route.toolNames, ["listar_tickets_fechados"]);
  assert.equal(route.entities.area, "Redes");
});

test("'por <nome>' não captura operador quando seguido de uma dimensão conhecida", () => {
  const route = routeTicketQuestion("Liste os tickets abertos por área de Redes.");

  assert.deepEqual(route.toolNames, ["listar_tickets_abertos"]);
  assert.equal(route.entities.area, "Redes");
  assert.equal(route.entities.operador, undefined);
});

test("frase com 'operador' explícito continua tendo prioridade sobre 'por <nome>'", () => {
  const route = routeTicketQuestion("Quantos tickets abertos existem do operador Ana?");

  assert.deepEqual(route.toolNames, ["listar_tickets_abertos"]);
  assert.equal(route.entities.operador, "Ana");
});

test("extrai período de datas em diferentes frases", () => {
  assert.deepEqual(
    extractDateRange("Liste os tickets entre 2026-01-01 e 2026-01-31."),
    { dataInicio: "2026-01-01", dataFim: "2026-01-31" },
  );
  assert.deepEqual(
    extractDateRange("Liste os tickets no período de 2026-01-01 até 2026-01-31."),
    { dataInicio: "2026-01-01", dataFim: "2026-01-31" },
  );
  assert.deepEqual(
    extractDateRange("Liste os tickets desde 2026-01-01."),
    { dataInicio: "2026-01-01" },
  );
  assert.deepEqual(
    extractDateRange("Liste os tickets a partir de 2026-01-01."),
    { dataInicio: "2026-01-01" },
  );
  assert.deepEqual(
    extractDateRange("Liste os tickets até 2026-01-31."),
    { dataFim: "2026-01-31" },
  );
  assert.deepEqual(extractDateRange("Liste os tickets."), {});
});

test("roteia listagem de tickets filtrada por período", () => {
  const route = routeTicketQuestion(
    "Liste os tickets da área de Redes entre 2026-01-01 e 2026-01-31.",
  );

  assert.deepEqual(route.toolNames, ["listar_tickets"]);
  assert.equal(route.entities.area, "Redes");
  assert.equal(route.entities.dataInicio, "2026-01-01");
  assert.equal(route.entities.dataFim, "2026-01-31");
});
