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
      name: "listar_tickets",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            minLength: 1,
            maxLength: 100,
          },
          limite: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 50,
          },
        },
      },
    },
  },
  {
    function: {
      name: "listar_areas_tickets",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

test("argumentos da rota substituem argumentos inventados", () => {
  const result = resolveToolArguments({
    name: "listar_tickets",
    modelArgs: {
      status: "Encerrada",
      limite: 5,
    },
    ollamaTools,
    routeToolArguments: {
      name: "listar_tickets",
      args: {
        status: "Aguardando atendimento",
        limite: 30,
      },
    },
    pergunta:
      "Liste os tickets aguardando atendimento, limite 30.",
  });

  assert.deepEqual(result, {
    status: "Aguardando atendimento",
    limite: 30,
  });
});

test("mantém normalização existente quando não há rota", () => {
  const result = resolveToolArguments({
    name: "listar_tickets",
    modelArgs: {
      limite: 10,
    },
    ollamaTools,
    routeToolArguments: null,
    pergunta: "Liste os tickets com limite 10.",
  });

  assert.deepEqual(result, {
    limite: 10,
  });
});

test("rejeita tool não disponibilizada", () => {
  assert.throws(
    () => resolveToolArguments({
      name: "buscar_ticket_por_numero",
      modelArgs: {},
      ollamaTools,
      routeToolArguments: null,
      pergunta: "Busque o ticket 1.",
    }),
    (error) =>
      error instanceof AgentError
      && error.code === "tool_nao_disponibilizada",
  );
});

test("rejeita tool diferente da rota", () => {
  assert.throws(
    () => resolveToolArguments({
      name: "listar_areas_tickets",
      modelArgs: {},
      ollamaTools,
      routeToolArguments: {
        name: "listar_tickets",
        args: {
          status: "Aguardando atendimento",
        },
      },
      pergunta: "Liste os tickets aguardando atendimento.",
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
                status: "Aguardando atendimento",
                limite: 30,
              },
              total: 0,
              tickets: [],
            }),
          },
        ],
      };
    },
  };

  const result = await runAgent({
    pergunta:
      "Liste os tickets aguardando atendimento, limite 30.",
    mcp,
    ollama,
    ollamaTools: [
      ollamaTools[0],
    ],
    routeToolArguments: {
      name: "listar_tickets",
      args: {
        status: "Aguardando atendimento",
        limite: 30,
      },
    },
    maxToolCalls: 1,
  });

  assert.deepEqual(calls, [
    {
      name: "listar_tickets",
      args: {
        status: "Aguardando atendimento",
        limite: 30,
      },
    },
  ]);

  assert.deepEqual(
    result.toolsUtilizadas,
    ["listar_tickets"],
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
