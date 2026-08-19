import assert from "node:assert/strict";
import test from "node:test";

import { formatToolResults } from "../agent/response-formatter.js";

function format(tool, dados) {
  return formatToolResults([{ tool, dados }]);
}

test("formata a data de cadastro do cliente como dd/mm/aaaa", () => {
  const resposta = format("listar_clientes_recentes", {
    quantidade: 1,
    clientes: [
      {
        id: 1,
        nome: "Ana Silva",
        email: "ana@example.com",
        ativo: true,
        criado_em: "2026-08-10T16:27:14.073Z",
      },
    ],
  });

  assert.match(resposta, /cadastro: \d{2}\/\d{2}\/2026/);
  assert.doesNotMatch(resposta, /2026-08-10T/);
});

test("formata prazo e conclusão da OS como data e hora", () => {
  const resposta = format("buscar_os_por_numero", {
    encontrado: true,
    ordem_servico: {
      numero: 1001,
      titulo: "Impressora indisponível",
      status: "aberta",
      prioridade: "alta",
      responsavel: "Carlos Souza",
      prazo: "2026-08-15T18:00:00.000Z",
      concluida_em: "2026-08-14T12:30:00.000Z",
    },
  });

  assert.match(resposta, /Prazo: \d{2}\/\d{2}\/2026 \d{2}:\d{2}/);
  assert.match(resposta, /Conclusão: \d{2}\/\d{2}\/2026 \d{2}:\d{2}/);
  assert.doesNotMatch(resposta, /2026-08-15T|2026-08-14T/);
});

test("formata a data dos eventos de histórico", () => {
  const resposta = format("consultar_historico_os", {
    encontrado: true,
    ordem_servico: { numero: 1001, titulo: "Impressora indisponível", status: "aberta" },
    historico: [
      {
        registrado_em: "2026-08-10T09:15:00.000Z",
        status: "em_andamento",
        descricao: "Técnico designado",
        autor: "Carlos Souza",
      },
    ],
  });

  assert.match(resposta, /- \d{2}\/\d{2}\/2026 \d{2}:\d{2}: em andamento/);
});

test("formata primeiro e último cadastro do resumo de clientes", () => {
  const resposta = format("resumo_clientes", {
    total: 2,
    ativos: 1,
    inativos: 1,
    primeiro_cadastro: "2026-07-27T18:25:25.184Z",
    ultimo_cadastro: "2026-08-10T16:27:14.073Z",
  });

  assert.match(resposta, /Primeiro cadastro: \d{2}\/\d{2}\/2026/);
  assert.match(resposta, /Último cadastro: \d{2}\/\d{2}\/2026/);
});

test("formata o mês do resumo de clientes por mês como mm/aaaa", () => {
  const resposta = format("resumo_clientes_por_mes", {
    quantidade_meses: 1,
    resumo: [{ mes: "2026-08", total: 3, ativos: 2 }],
  });

  assert.match(resposta, /- 08\/2026: total 3; ativos 2/);
});
