import assert from "node:assert/strict";
import test from "node:test";

import { createMcpClient } from "../agent/mcp-client.js";

const REQUIRED_TOOL_NAMES = [
  "listar_areas_tickets",
  "listar_prioridades_tickets",
  "listar_canais_tickets",
  "listar_status_tickets",
  "listar_departamentos_tickets",
  "listar_usuarios_tickets",
  "buscar_usuarios_por_nome",
  "buscar_ticket_por_numero",
  "listar_tickets",
  "resumo_tickets_por_status",
  "resumo_tickets_por_prioridade",
  "resumo_tickets_por_area",
  "resumo_tickets_por_operador",
  "resumo_tickets_por_departamento",
  "resumo_tickets_por_cliente",
  "buscar_tickets_por_texto",
  "listar_tickets_congelados",
  "listar_tickets_abertos",
  "listar_tickets_fechados",
  "listar_tickets_sem_operador",
  "listar_tickets_abertos_mais_antigos",
  "listar_tickets_vencidos",
  "listar_tickets_mais_recentes",
  "listar_tickets_mais_antigos",
  "resumo_operacional_tickets",
  "analisar_carga_operador",
  "analisar_atividade_cliente",
];

function fakeClient({ tools, callToolImpl, closeImpl } = {}) {
  const calls = { connect: 0, listTools: 0, close: 0 };

  return {
    calls,
    async connect() {
      calls.connect += 1;
    },
    async listTools() {
      calls.listTools += 1;
      return { tools };
    },
    async callTool(args) {
      return callToolImpl ? callToolImpl(args) : { content: [], isError: false };
    },
    async close() {
      calls.close += 1;
      return closeImpl?.();
    },
  };
}

function toolStub(name) {
  return { name, description: name, inputSchema: { type: "object", properties: {} } };
}

test("filtra as tools do servidor MCP pela whitelist (ignora tools extras não previstas)", async () => {
  const fake = fakeClient({
    tools: [...REQUIRED_TOOL_NAMES.map(toolStub), toolStub("tool_nao_prevista")],
  });

  const mcp = await createMcpClient({
    projectDir: "/tmp",
    createTransport: () => ({}),
    createClient: () => fake,
  });

  assert.equal(mcp.tools.length, REQUIRED_TOOL_NAMES.length);
  assert.ok(!mcp.tools.some((tool) => tool.name === "tool_nao_prevista"));
});

test("lança erro e fecha a conexão se alguma tool obrigatória estiver ausente no servidor MCP", async () => {
  const semUmaTool = REQUIRED_TOOL_NAMES.filter((name) => name !== "analisar_carga_operador");
  const fake = fakeClient({ tools: semUmaTool.map(toolStub) });

  await assert.rejects(
    () =>
      createMcpClient({
        projectDir: "/tmp",
        createTransport: () => ({}),
        createClient: () => fake,
      }),
    /Tools MCP obrigatórias ausentes: analisar_carga_operador/,
  );

  assert.equal(fake.calls.close, 1);
});

test("callTool repassa nome/argumentos ao client real quando a tool é permitida", async () => {
  let recebido;
  const fake = fakeClient({
    tools: REQUIRED_TOOL_NAMES.map(toolStub),
    callToolImpl: (args) => {
      recebido = args;
      return { content: [{ type: "text", text: "ok" }], isError: false };
    },
  });

  const mcp = await createMcpClient({
    projectDir: "/tmp",
    createTransport: () => ({}),
    createClient: () => fake,
  });

  const result = await mcp.callTool("listar_tickets", { limite: 5 });

  assert.deepEqual(recebido, { name: "listar_tickets", arguments: { limite: 5 } });
  assert.equal(result.isError, false);
});

test("callTool rejeita qualquer nome fora da whitelist, mesmo que o servidor MCP o exponha", async () => {
  const fake = fakeClient({ tools: REQUIRED_TOOL_NAMES.map(toolStub) });

  const mcp = await createMcpClient({
    projectDir: "/tmp",
    createTransport: () => ({}),
    createClient: () => fake,
  });

  await assert.rejects(
    () => mcp.callTool("deletar_ticket", {}),
    /Tool MCP não permitida\./,
  );
});

test("close() delega ao client real", async () => {
  const fake = fakeClient({ tools: REQUIRED_TOOL_NAMES.map(toolStub) });

  const mcp = await createMcpClient({
    projectDir: "/tmp",
    createTransport: () => ({}),
    createClient: () => fake,
  });

  await mcp.close();
  assert.equal(fake.calls.close, 1);
});
