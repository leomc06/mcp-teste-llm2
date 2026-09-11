import assert from "node:assert/strict";
import test from "node:test";

import { AgentError, runCompare } from "../agent/agent-loop.js";

function mcpMock(responsesByOperator) {
  const calls = [];

  return {
    calls,
    async callTool(name, args) {
      calls.push({ name, args });

      const dados = responsesByOperator[args.operador ?? args.numero];

      if (!dados) {
        throw new Error("caso não configurado no mock");
      }

      return {
        content: [{ type: "text", text: JSON.stringify(dados) }],
        isError: false,
      };
    },
  };
}

test("runCompare chama a tool 2 vezes (uma por lado) e combina as respostas", async () => {
  const mcp = mcpMock({
    "Fábio Gali": {
      encontrado: true,
      operador: "Fábio Gali",
      total: 10,
      abertos: 2,
      fechados: 8,
      congelados: 0,
      prioridade_alta_ou_urgente: 1,
      mais_antigo_aberto: null,
    },
    "Cesar Augusto": {
      encontrado: true,
      operador: "Cesar Augusto",
      total: 20,
      abertos: 5,
      fechados: 15,
      congelados: 1,
      prioridade_alta_ou_urgente: 2,
      mais_antigo_aberto: null,
    },
  });

  const result = await runCompare({
    mcp,
    comparisons: [
      { toolName: "analisar_carga_operador", args: { operador: "Fábio Gali" } },
      { toolName: "analisar_carga_operador", args: { operador: "Cesar Augusto" } },
    ],
  });

  assert.equal(mcp.calls.length, 2);
  assert.equal(result.quantidadeChamadas, 2);
  assert.deepEqual(result.toolsUtilizadas, ["analisar_carga_operador", "analisar_carga_operador"]);
  assert.match(result.resposta, /Fábio Gali/);
  assert.match(result.resposta, /Cesar Augusto/);
  assert.match(result.resposta, /--- 1 ---/);
  assert.match(result.resposta, /--- 2 ---/);
  assert.equal(result.dadosConsultados.length, 2);
});

test("runCompare lança AgentError se uma das duas chamadas retornar isError", async () => {
  const mcp = {
    async callTool(name, args) {
      if (args.numero === 100) {
        return { content: [{ type: "text", text: "Não foi possível consultar a API de tickets." }], isError: true };
      }

      return { content: [{ type: "text", text: JSON.stringify({ encontrado: true, ticket: { number: 200 } }) }] };
    },
  };

  await assert.rejects(
    () =>
      runCompare({
        mcp,
        comparisons: [
          { toolName: "buscar_ticket_por_numero", args: { numero: 100 } },
          { toolName: "buscar_ticket_por_numero", args: { numero: 200 } },
        ],
      }),
    (error) => error instanceof AgentError && error.code === "falha_mcp",
  );
});

test("runCompare lança AgentError se a chamada MCP falhar (exceção de transporte)", async () => {
  const mcp = {
    async callTool() {
      throw new Error("processo MCP morreu");
    },
  };

  await assert.rejects(
    () =>
      runCompare({
        mcp,
        comparisons: [
          { toolName: "buscar_ticket_por_numero", args: { numero: 100 } },
          { toolName: "buscar_ticket_por_numero", args: { numero: 200 } },
        ],
      }),
    (error) => error instanceof AgentError && error.code === "falha_mcp",
  );
});

test("runCompare coleta fontes (números de ticket) dos dois lados", async () => {
  const mcp = {
    async callTool(name, args) {
      return {
        content: [{ type: "text", text: JSON.stringify({ encontrado: true, ticket: { number: args.numero } }) }],
        isError: false,
      };
    },
  };

  const result = await runCompare({
    mcp,
    comparisons: [
      { toolName: "buscar_ticket_por_numero", args: { numero: 100 } },
      { toolName: "buscar_ticket_por_numero", args: { numero: 200 } },
    ],
  });

  const numeros = result.fontes.map((fonte) => fonte.numero).sort((a, b) => a - b);
  assert.deepEqual(numeros, [100, 200]);
});
