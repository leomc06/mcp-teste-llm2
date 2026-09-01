import assert from "node:assert/strict";
import test from "node:test";

import { formatToolResults } from "../agent/response-formatter.js";

function format(tool, dados) {
  return formatToolResults([{ tool, dados }]);
}

test("formata a lista de tickets, incluindo a data de abertura sem hora bruta", () => {
  const resposta = format("listar_tickets", {
    filtros: { status: undefined },
    total: 1,
    pagina: 1,
    paginas: 1,
    tickets: [
      {
        number: 1,
        opening_date: "2026-08-20 09:15:00",
        priority: "Alta",
        area: "DEFAULT",
        issue: "Rede",
        description: "Sem acesso à internet",
        operator: "admin",
        status: "Aguardando atendimento",
        is_frozen: false,
      },
    ],
  });

  assert.match(resposta, /Ticket 1: Rede/);
  assert.match(resposta, /aberto em: 20\/08\/2026 09:15/);
  assert.doesNotMatch(resposta, /2026-08-20 09:15:00/);
});

test("avisa quando a lista de tickets foi truncada por volume", () => {
  const resposta = format("listar_tickets", {
    filtros: {},
    total: 1,
    pagina: 1,
    paginas: 1,
    truncado: true,
    tickets: [
      {
        number: 1,
        opening_date: "2026-08-20 09:15:00",
        priority: "Alta",
        area: "DEFAULT",
        issue: "Rede",
        operator: "admin",
        status: "Aguardando atendimento",
        is_frozen: false,
      },
    ],
  });

  assert.match(resposta, /resultado parcial: consulta truncada por volume de tickets/);
});

test("formata o detalhe do ticket com SLA e datas ISO em hora de Brasília", () => {
  const resposta = format("buscar_ticket_por_numero", {
    encontrado: true,
    ticket: {
      number: 1,
      opening_date: "2026-08-20 09:15:00",
      priority: "Alta",
      area: "DEFAULT",
      issue: "Rede",
      description: "Sem acesso à internet",
      operator: "admin",
      status: "Aguardando atendimento",
      treatment_date: "2026-08-27 16:10:52",
      closure_date: null,
      is_frozen: true,
      lifetime: {
        result_sla_response: 4,
        result_sla_solution: 1,
      },
      entries: [],
      files: [],
    },
  });

  assert.match(resposta, /Ticket 1: Rede/);
  assert.match(resposta, /Início do tratamento: 27\/08\/2026 16:10/);
  assert.match(resposta, /SLA de resposta: excedeu o SLA; SLA de solução: não definido/);
  assert.match(resposta, /SLA congelado: sim/);
  assert.doesNotMatch(resposta, /2026-08-27T16:10/);
});

test("ticket não encontrado retorna mensagem amigável", () => {
  const resposta = format("buscar_ticket_por_numero", {
    encontrado: false,
    ticket: null,
  });

  assert.match(resposta, /não foi encontrado/);
});

test("formata resumo de tickets por status", () => {
  const resposta = format("resumo_tickets_por_status", {
    filtros: {},
    total_tickets: 3,
    truncado: false,
    resumo: [
      { chave: "Aguardando atendimento", quantidade: 2 },
      { chave: "Em atendimento", quantidade: 1 },
    ],
  });

  assert.match(resposta, /Resumo de 3 ticket\(s\) por status:/);
  assert.match(resposta, /- Aguardando atendimento: 2/);
});

test("formata resumo de tickets por status com totais de abertos e fechados", () => {
  const resposta = format("resumo_tickets_por_status", {
    filtros: {},
    total_tickets: 3,
    truncado: false,
    abertos: 2,
    fechados: 1,
    resumo: [
      { chave: "Aguardando atendimento", quantidade: 2 },
      { chave: "Encerrada", quantidade: 1 },
    ],
  });

  assert.match(resposta, /Total abertos: 2; total fechados: 1/);
});

test("formata resumo de tickets por prioridade com totais de abertos e fechados", () => {
  const resposta = format("resumo_tickets_por_prioridade", {
    filtros: {},
    total_tickets: 3,
    truncado: false,
    abertos: 1,
    fechados: 2,
    resumo: [
      { chave: "Alta", quantidade: 1 },
      { chave: "Baixa", quantidade: 2 },
    ],
  });

  assert.match(resposta, /Total abertos: 1; total fechados: 2/);
});

test("formata resumo de tickets por área com totais de abertos e fechados", () => {
  const resposta = format("resumo_tickets_por_area", {
    filtros: {},
    total_tickets: 5,
    truncado: false,
    abertos: 4,
    fechados: 1,
    resumo: [
      { chave: "Suporte", quantidade: 5 },
    ],
  });

  assert.match(resposta, /Total abertos: 4; total fechados: 1/);
});

test("formata lista de áreas de ticket", () => {
  const resposta = format("listar_areas_tickets", {
    quantidade: 2,
    areas: [
      { id: 1, name: "DEFAULT", active: true },
      { id: 2, name: "Redes", active: false },
    ],
  });

  assert.match(resposta, /2 área\(s\) de ticket encontrada\(s\):/);
  assert.match(resposta, /- Redes \(inativa\)/);
});
