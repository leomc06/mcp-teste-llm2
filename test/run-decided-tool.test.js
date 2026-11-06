import assert from "node:assert/strict";
import test from "node:test";

import { AgentError, runDecidedTool } from "../agent/agent-loop.js";

function mcpMock(dados) {
  const calls = [];

  return {
    calls,
    async callTool(name, args) {
      calls.push({ name, args });
      return { content: [{ type: "text", text: JSON.stringify(dados) }], isError: false };
    },
  };
}

test("runDecidedTool chama a tool 1 vez só, com os argumentos recebidos, sem chamar o Ollama", async () => {
  const mcp = mcpMock({ total: 5, abertos: 2, fechados: 3, resumo: [] });
  const ollama = { chat: async () => { throw new Error("não deveria ser chamado"); } };

  const result = await runDecidedTool({
    mcp,
    ollama,
    name: "resumo_tickets_por_status",
    args: { area: "Suporte" },
  });

  assert.equal(mcp.calls.length, 1);
  assert.deepEqual(mcp.calls[0], { name: "resumo_tickets_por_status", args: { area: "Suporte" } });
  assert.equal(result.quantidadeChamadas, 1);
  assert.deepEqual(result.toolsUtilizadas, ["resumo_tickets_por_status"]);
  assert.equal(result.dadosConsultados.length, 1);
});

test("runDecidedTool lança AgentError se a tool retornar isError", async () => {
  const mcp = {
    async callTool() {
      return { content: [{ type: "text", text: "Não foi possível consultar a API de tickets." }], isError: true };
    },
  };

  await assert.rejects(
    () => runDecidedTool({ mcp, ollama: {}, name: "listar_tickets", args: {} }),
    (error) => error instanceof AgentError && error.code === "falha_mcp",
  );
});

test("runDecidedTool lança AgentError se a chamada MCP falhar (exceção de transporte)", async () => {
  const mcp = {
    async callTool() {
      throw new Error("processo MCP morreu");
    },
  };

  await assert.rejects(
    () => runDecidedTool({ mcp, ollama: {}, name: "listar_tickets", args: {} }),
    (error) => error instanceof AgentError && error.code === "falha_mcp",
  );
});

test("runDecidedTool coleta fontes (número de ticket) do resultado", async () => {
  const mcp = mcpMock({ encontrado: true, ticket: { number: 4830 } });

  const result = await runDecidedTool({
    mcp,
    ollama: {},
    name: "buscar_ticket_por_numero",
    args: { numero: 4830 },
  });

  assert.deepEqual(result.fontes.map((fonte) => fonte.numero), [4830]);
});

test("runDecidedTool com synthesize chama o Ollama só pra sintetizar o resultado já obtido (nunca pra decidir a tool)", async () => {
  const mcp = mcpMock({
    encontrado: true,
    ticket: {
      number: 4830,
      issue: "Impressora não imprime",
      description: "Usuário relata que a impressora do 3º andar parou de funcionar.",
      comments: [{ text: "Técnico verificou o toner.", author: "Fábio" }],
    },
  });

  const chatCalls = [];
  const ollama = {
    async chat({ messages }) {
      chatCalls.push(messages);
      return { message: { role: "assistant", content: "Resumo sintético do ticket." } };
    },
  };

  const result = await runDecidedTool({
    mcp,
    ollama,
    name: "buscar_ticket_por_numero",
    args: { numero: 4830 },
    synthesize: "resumo_ticket",
  });

  assert.equal(chatCalls.length, 1);
  assert.match(result.resposta, /Resumo sintético do ticket\./);
});

test("runDecidedTool sem synthesize não chama o Ollama", async () => {
  const mcp = mcpMock({ encontrado: true, ticket: { number: 4830 } });
  let chatCalled = false;
  const ollama = { async chat() { chatCalled = true; return { message: { role: "assistant", content: "x" } }; } };

  await runDecidedTool({ mcp, ollama, name: "buscar_ticket_por_numero", args: { numero: 4830 } });

  assert.equal(chatCalled, false);
});
