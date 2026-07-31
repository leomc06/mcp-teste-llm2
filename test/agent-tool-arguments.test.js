import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentError,
  resolveToolArguments,
  runAgent,
} from "../agent/agent-loop.js";

const ollamaTools = [
  {
    function: {
      name: "listar_os_por_status",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: [
              "aberta",
              "em_andamento",
              "aguardando",
              "concluida",
              "cancelada",
            ],
          },
          dias: {
            type: "integer",
            minimum: 1,
            maximum: 3650,
            default: 365,
          },
        },
        required: ["status"],
      },
    },
  },
  {
    function: {
      name: "listar_clientes",
      parameters: {
        type: "object",
        properties: {
          limite: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 20,
          },
        },
      },
    },
  },
];

test("argumentos da rota substituem argumentos inventados", () => {
  const result = resolveToolArguments({
    name: "listar_os_por_status",
    modelArgs: {
      status: "concluida",
      dias: 0,
    },
    ollamaTools,
    routeToolArguments: {
      name: "listar_os_por_status",
      args: {
        status: "cancelada",
        dias: 30,
      },
    },
    pergunta:
      "Liste as OS canceladas nos últimos 30 dias.",
  });

  assert.deepEqual(result, {
    status: "cancelada",
    dias: 30,
  });
});

test("mantém normalização existente quando não há rota de OS", () => {
  const result = resolveToolArguments({
    name: "listar_clientes",
    modelArgs: {
      limite: 10,
    },
    ollamaTools,
    routeToolArguments: null,
    pergunta: "Liste os clientes com limite 10.",
  });

  assert.deepEqual(result, {
    limite: 10,
  });
});

test("rejeita tool não disponibilizada", () => {
  assert.throws(
    () => resolveToolArguments({
      name: "informacoes_banco",
      modelArgs: {},
      ollamaTools,
      routeToolArguments: null,
      pergunta: "Mostre o banco.",
    }),
    (error) =>
      error instanceof AgentError
      && error.code === "tool_nao_disponibilizada",
  );
});

test("rejeita tool diferente da rota", () => {
  assert.throws(
    () => resolveToolArguments({
      name: "listar_clientes",
      modelArgs: {},
      ollamaTools,
      routeToolArguments: {
        name: "listar_os_por_status",
        args: {
          status: "cancelada",
        },
      },
      pergunta: "Liste as OS canceladas.",
    }),
    (error) =>
      error instanceof AgentError
      && error.code === "tool_divergente_da_rota",
  );
});
test("força a tool da rota quando a LLM não cria tool call", async () => {
  const calls = [];

  const ollama = {
    async chat() {
      return {
        message: {
          role: "assistant",
          content:
            "Não tenho acesso aos dados solicitados.",
          tool_calls: [],
        },
      };
    },
  };

  const mcp = {
    async callTool(name, args) {
      calls.push({
        name,
        args,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              filtros: {
                status: "cancelada",
                periodo_dias: 30,
                limite: 20,
              },
              quantidade: 0,
              ordens_servico: [],
            }),
          },
        ],
      };
    },
  };

  const result = await runAgent({
    pergunta:
      "Liste as OS canceladas nos últimos 30 dias.",
    mcp,
    ollama,
    ollamaTools: [
      ollamaTools[0],
    ],
    routeToolArguments: {
      name: "listar_os_por_status",
      args: {
        status: "cancelada",
        dias: 30,
      },
    },
    maxToolCalls: 1,
  });

  assert.deepEqual(calls, [
    {
      name: "listar_os_por_status",
      args: {
        status: "cancelada",
        dias: 30,
      },
    },
  ]);

  assert.deepEqual(
    result.toolsUtilizadas,
    ["listar_os_por_status"],
  );

  assert.equal(
    result.quantidadeChamadas,
    1,
  );
});

test("não força tool quando não existe rota determinística", async () => {
  let mcpWasCalled = false;

  const result = await runAgent({
    pergunta: "Olá.",
    mcp: {
      async callTool() {
        mcpWasCalled = true;

        throw new Error(
          "O MCP não deveria ser chamado.",
        );
      },
    },
    ollama: {
      async chat() {
        return {
          message: {
            role: "assistant",
            content: "Olá! Como posso ajudar?",
            tool_calls: [],
          },
        };
      },
    },
    ollamaTools: [],
    routeToolArguments: null,
    maxToolCalls: 1,
  });

  assert.equal(mcpWasCalled, false);
  assert.equal(result.quantidadeChamadas, 0);
  assert.deepEqual(result.toolsUtilizadas, []);
  assert.equal(
    result.resposta,
    "Olá! Como posso ajudar?",
  );
});
