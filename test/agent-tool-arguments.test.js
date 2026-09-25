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

const buscarTicketTool = {
  function: {
    name: "buscar_ticket_por_numero",
    parameters: {
      type: "object",
      properties: {
        numero: { type: "integer" },
      },
    },
  },
};

const resumoOperacionalTool = {
  function: {
    name: "resumo_operacional_tickets",
    parameters: {
      type: "object",
      properties: {
        area: { type: "string", minLength: 1, maxLength: 100 },
      },
    },
  },
};

// A 1ª chamada ao ollama.chat sempre devolve tool_calls vazio de propósito
// (aciona mustForceRouteTool, igual aos testes acima) — só a 2ª chamada
// (a de síntese) varia por teste.
function createSynthesisOllamaMock(secondCallBehavior) {
  const calls = [];

  return {
    calls,
    async chat({ messages }) {
      calls.push(messages);

      if (calls.length === 1) {
        return { message: { role: "assistant", content: "", tool_calls: [] } };
      }

      return secondCallBehavior();
    },
  };
}

test("synthesize: resumo_ticket combina o resumo do modelo com o detalhe completo", async () => {
  const ollama = createSynthesisOllamaMock(() => ({
    message: { role: "assistant", content: "Cliente sem acesso; problema resolvido após verificação.", tool_calls: [] },
  }));

  const mcp = {
    async callTool() {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            encontrado: true,
            ticket: {
              number: 4830,
              opening_date: "2026-01-01 09:00:00",
              priority: "Alta",
              area: "WEB",
              issue: "Sem acesso",
              description: "Cliente relatou que não consegue acessar o sistema desde ontem.",
              operator: "Fulano",
              status: "ENCERRADA",
              entries: [{ entry: "Verificado, resolvido.", author: "Fulano", date: "2026-01-01 10:00:00", type: 2 }],
              files: [],
            },
          }),
        }],
      };
    },
  };

  const result = await runAgent({
    pergunta: "Resuma o ticket 4830.",
    mcp,
    ollama,
    ollamaTools: [buscarTicketTool],
    routeToolArguments: { name: "buscar_ticket_por_numero", args: { numero: 4830 } },
    synthesize: "resumo_ticket",
    maxToolCalls: 1,
  });

  assert.equal(ollama.calls.length, 2);
  assert.match(result.resposta, /^Resumo automático: Cliente sem acesso; problema resolvido após verificação\./);
  assert.match(result.resposta, /--- Ticket completo ---/);
  assert.match(result.resposta, /Ticket 4830: Sem acesso/);
  assert.match(result.resposta, /Verificado, resolvido\./);
});

test("synthesize: resumo_ticket não chama o modelo de novo quando o ticket não é encontrado", async () => {
  const ollama = createSynthesisOllamaMock(() => {
    throw new Error("não deveria sintetizar um ticket não encontrado");
  });

  const mcp = {
    async callTool() {
      return {
        content: [{ type: "text", text: JSON.stringify({ encontrado: false, ticket: null }) }],
      };
    },
  };

  const result = await runAgent({
    pergunta: "Resuma o ticket 9999.",
    mcp,
    ollama,
    ollamaTools: [buscarTicketTool],
    routeToolArguments: { name: "buscar_ticket_por_numero", args: { numero: 9999 } },
    synthesize: "resumo_ticket",
    maxToolCalls: 1,
  });

  assert.equal(ollama.calls.length, 1);
  assert.equal(result.resposta, "O ticket informado não foi encontrado.");
});

test("synthesize: resumo_ticket não chama o modelo de novo quando não há descrição nem comentário real", async () => {
  const mcp = {
    async callTool() {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            encontrado: true,
            ticket: { number: 1, description: "", entries: [], files: [] },
          }),
        }],
      };
    },
  };

  const ollama = createSynthesisOllamaMock(() => {
    throw new Error("não deveria sintetizar um ticket sem conteúdo");
  });

  await runAgent({
    pergunta: "Resuma o ticket 1.",
    mcp,
    ollama,
    ollamaTools: [buscarTicketTool],
    routeToolArguments: { name: "buscar_ticket_por_numero", args: { numero: 1 } },
    synthesize: "resumo_ticket",
    maxToolCalls: 1,
  });

  assert.equal(ollama.calls.length, 1);
});

test("synthesize: resumo_ticket cai pro detalhe completo com aviso quando a síntese falha", async () => {
  const ollama = createSynthesisOllamaMock(() => {
    throw new Error("timeout simulado");
  });

  const mcp = {
    async callTool() {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            encontrado: true,
            ticket: {
              number: 4830,
              description: "Cliente relatou que não consegue acessar o sistema desde ontem.",
              entries: [],
              files: [],
            },
          }),
        }],
      };
    },
  };

  const result = await runAgent({
    pergunta: "Resuma o ticket 4830.",
    mcp,
    ollama,
    ollamaTools: [buscarTicketTool],
    routeToolArguments: { name: "buscar_ticket_por_numero", args: { numero: 4830 } },
    synthesize: "resumo_ticket",
    maxToolCalls: 1,
  });

  assert.equal(ollama.calls.length, 2);
  assert.doesNotMatch(result.resposta, /^Resumo automático:/);
  assert.match(result.resposta, /\(resumo automático indisponível no momento; seguem os dados completos\)$/);
  assert.match(result.resposta, /Ticket 4830:/);
});

test("synthesize: resumo_executivo combina o parágrafo do modelo com os números", async () => {
  const ollama = createSynthesisOllamaMock(() => ({
    message: { role: "assistant", content: "A operação está estável, com poucos chamados em aberto.", tool_calls: [] },
  }));

  const mcp = {
    async callTool() {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            filtros: {},
            truncado: false,
            total: 10,
            abertos: 5,
            fechados: 5,
            sem_operador: 1,
            congelados: 0,
            por_prioridade: [{ chave: "Alta", quantidade: 3 }],
            abertos_com_mais_de_7_dias: 2,
            mais_antigos_em_aberto: [],
          }),
        }],
      };
    },
  };

  const result = await runAgent({
    pergunta: "Resumo executivo da operação.",
    mcp,
    ollama,
    ollamaTools: [resumoOperacionalTool],
    routeToolArguments: { name: "resumo_operacional_tickets", args: {} },
    synthesize: "resumo_executivo",
    maxToolCalls: 1,
  });

  assert.equal(ollama.calls.length, 2);
  assert.match(result.resposta, /^Resumo executivo: A operação está estável, com poucos chamados em aberto\./);
  assert.match(result.resposta, /--- Números da operação ---/);
  assert.match(result.resposta, /Visão geral de 10 ticket\(s\):/);
});

test("synthesize: resumo_executivo gera parágrafo mesmo com todos os números zerados", async () => {
  const ollama = createSynthesisOllamaMock(() => ({
    message: { role: "assistant", content: "Nenhum chamado foi registrado no período consultado.", tool_calls: [] },
  }));

  const mcp = {
    async callTool() {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            filtros: { area: "Redes", dataInicio: "2026-01-01", dataFim: "2026-01-31" },
            truncado: false,
            total: 0,
            abertos: 0,
            fechados: 0,
            sem_operador: 0,
            congelados: 0,
            por_prioridade: [],
            abertos_com_mais_de_7_dias: 0,
            mais_antigos_em_aberto: [],
          }),
        }],
      };
    },
  };

  const result = await runAgent({
    pergunta: "Resumo executivo da área de Redes em janeiro.",
    mcp,
    ollama,
    ollamaTools: [resumoOperacionalTool],
    routeToolArguments: { name: "resumo_operacional_tickets", args: { area: "Redes" } },
    synthesize: "resumo_executivo",
    maxToolCalls: 1,
  });

  assert.equal(ollama.calls.length, 2);
  assert.match(result.resposta, /^Resumo executivo: Nenhum chamado foi registrado no período consultado\./);
});

test("sem synthesize, o modelo é chamado só 1 vez (comportamento de hoje inalterado)", async () => {
  const ollama = createSynthesisOllamaMock(() => {
    throw new Error("não deveria haver 2ª chamada sem synthesize");
  });

  const mcp = {
    async callTool() {
      return {
        content: [{ type: "text", text: JSON.stringify({ encontrado: false, ticket: null }) }],
      };
    },
  };

  const result = await runAgent({
    pergunta: "Busque o ticket 1.",
    mcp,
    ollama,
    ollamaTools: [buscarTicketTool],
    routeToolArguments: { name: "buscar_ticket_por_numero", args: { numero: 1 } },
    maxToolCalls: 1,
  });

  assert.equal(ollama.calls.length, 1);
  assert.equal(result.resposta, "O ticket informado não foi encontrado.");
});
