import assert from "node:assert/strict";
import test from "node:test";

import { formatComparison } from "../agent/response-formatter.js";

test("formatComparison combina 2 cargas de operador lado a lado, sem apontar 'vencedor'", () => {
  const resposta = formatComparison("analisar_carga_operador", [
    {
      encontrado: true,
      operador: "Fábio Gali",
      total: 10,
      abertos: 2,
      fechados: 8,
      congelados: 0,
      prioridade_alta_ou_urgente: 1,
      mais_antigo_aberto: null,
    },
    {
      encontrado: true,
      operador: "Cesar Augusto",
      total: 20,
      abertos: 5,
      fechados: 15,
      congelados: 1,
      prioridade_alta_ou_urgente: 2,
      mais_antigo_aberto: null,
    },
  ]);

  assert.match(resposta, /--- 1 ---/);
  assert.match(resposta, /--- 2 ---/);
  assert.match(resposta, /Fábio Gali/);
  assert.match(resposta, /Cesar Augusto/);
  assert.match(resposta, /10 ticket\(s\) no total/);
  assert.match(resposta, /20 ticket\(s\) no total/);
});

test("formatComparison combina 2 atividades de cliente lado a lado (Img 33)", () => {
  const resposta = formatComparison("analisar_atividade_cliente", [
    {
      encontrado: true,
      cliente: "Cesar Augusto de Mello",
      total: 12,
      abertos: 3,
      fechados: 9,
      congelados: 0,
      prioridade_alta_ou_urgente: 1,
      mais_antigo_aberto: null,
    },
    {
      encontrado: true,
      cliente: "Diego Mota Siqueira",
      total: 7,
      abertos: 1,
      fechados: 6,
      congelados: 0,
      prioridade_alta_ou_urgente: 0,
      mais_antigo_aberto: null,
    },
  ]);

  assert.match(resposta, /--- 1 ---/);
  assert.match(resposta, /--- 2 ---/);
  assert.match(resposta, /Cesar Augusto de Mello/);
  assert.match(resposta, /Diego Mota Siqueira/);
  assert.match(resposta, /12 ticket\(s\) no total/);
  assert.match(resposta, /7 ticket\(s\) no total/);
});

// Achado testando o lote de perguntas ao vivo — Médias 1, pergunta 14: não
// existe tool de "carga da área" (como existe pra operador/cliente);
// listar_tickets com só o filtro de área é reaproveitada pra comparação, e
// o formatter só mostra o total (não a lista de tickets em si).
test("formatComparison combina 2 totais de área lado a lado (reaproveitando listar_tickets)", () => {
  const resposta = formatComparison("listar_tickets", [
    { filtros: { area: "Suporte" }, total: 4429, pagina: 1, paginas: 1, tickets: [] },
    { filtros: { area: "WEB" }, total: 237, pagina: 1, paginas: 1, tickets: [] },
  ]);

  assert.match(resposta, /--- 1 ---/);
  assert.match(resposta, /--- 2 ---/);
  assert.match(resposta, /Área Suporte: 4429 ticket\(s\) no total/);
  assert.match(resposta, /Área WEB: 237 ticket\(s\) no total/);
});

test("formatComparison de área repassa o motivo quando um dos lados não é encontrado", () => {
  const resposta = formatComparison("listar_tickets", [
    { filtros: { area: "Suporte" }, total: 4429, pagina: 1, paginas: 1, tickets: [] },
    { encontrado: false, motivo: 'área "Financeiro" não encontrado.' },
  ]);

  assert.match(resposta, /área "Financeiro" não encontrado/);
});

test("formatComparison combina 2 detalhes de ticket lado a lado", () => {
  const resposta = formatComparison("buscar_ticket_por_numero", [
    {
      encontrado: true,
      ticket: {
        number: 100,
        issue: "Impressora não liga",
        status: "ENCERRADA",
        priority: "Baixa",
        area: "Suporte",
        opening_date: "2026-01-01 10:00:00",
      },
    },
    {
      encontrado: true,
      ticket: {
        number: 200,
        issue: "VPN caindo",
        status: "EM ATENDIMENTO",
        priority: "Alta",
        area: "Redes e Segurança",
        opening_date: "2026-02-01 10:00:00",
      },
    },
  ]);

  assert.match(resposta, /Ticket 100/);
  assert.match(resposta, /Ticket 200/);
  assert.match(resposta, /Impressora não liga/);
  assert.match(resposta, /VPN caindo/);
});

// Achado ao ligar o LLM de nuvem (Fase 3 do plano de migração, ver
// agent/llm-router.js): "qual área tem mais tickets, WEB ou Suporte?"
// fazia o Claude escolher resumo_tickets_por_area (não listar_tickets,
// que é o que o roteador por regex usaria) pra comparação — uma escolha
// de tool razoável, mas fora das 4 com formatter dedicado em
// COMPARISON_FORMATTERS, e isso derrubava a comparação inteira com
// "comparacao_nao_suportada" ao vivo. formatComparison agora cai no
// formatOne genérico (o mesmo usado pra formatar qualquer uma das 27
// tools fora de comparação) pra qualquer tool sem formatter dedicado, em
// vez de recusar.
test("formatComparison cai no formatOne genérico pra tool sem formatter dedicado, em vez de recusar (achado ao vivo com o LLM de nuvem)", () => {
  const resposta = formatComparison("resumo_tickets_por_area", [
    {
      filtros: { area: "WEB" },
      total_tickets: 10,
      abertos: 3,
      fechados: 7,
      resumo: [{ chave: "Aberta", quantidade: 10, percentual: 100 }],
    },
    {
      filtros: { area: "Suporte" },
      total_tickets: 20,
      abertos: 5,
      fechados: 15,
      resumo: [{ chave: "Aberta", quantidade: 20, percentual: 100 }],
    },
  ]);

  assert.match(resposta, /--- 1 ---/);
  assert.match(resposta, /--- 2 ---/);
  assert.match(resposta, /10 ticket/);
  assert.match(resposta, /20 ticket/);
});
