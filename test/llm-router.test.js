import assert from "node:assert/strict";
import test from "node:test";

import { AgentError } from "../agent/agent-error.js";
import { buildSystemPrompt, interpretQuestion } from "../agent/llm-router.js";

test("buildSystemPrompt inclui a data de hoje no formato AAAA-MM-DD", () => {
  const prompt = buildSystemPrompt({ today: "2026-11-06" });
  assert.match(prompt, /Hoje é 2026-11-06\./);
  assert.match(prompt, /read-only/);
});

test("interpretQuestion devolve {toolName, args} quando o LLM chama uma tool", async () => {
  const llm = {
    async chat({ messages, tools }) {
      assert.equal(messages[0].role, "system");
      assert.equal(messages[1].content, "Quantos tickets estão abertos na área Suporte?");
      assert.deepEqual(tools, [{ name: "listar_tickets_abertos", description: "x", input_schema: {} }]);

      return {
        message: {
          role: "assistant",
          content: "",
          tool_calls: [{ id: "1", function: { name: "listar_tickets_abertos", arguments: { area: "Suporte" } } }],
        },
      };
    },
  };

  const decision = await interpretQuestion({
    llm,
    llmTools: [{ name: "listar_tickets_abertos", description: "x", input_schema: {} }],
    pergunta: "Quantos tickets estão abertos na área Suporte?",
  });

  assert.deepEqual(decision, { toolName: "listar_tickets_abertos", args: { area: "Suporte" } });
});

test("interpretQuestion devolve {resposta} quando o LLM não chama nenhuma tool (esclarecimento/fora do domínio)", async () => {
  const llm = {
    async chat() {
      return { message: { role: "assistant", content: "Pode dizer qual período você quer ver?" } };
    },
  };

  const decision = await interpretQuestion({ llm, llmTools: [], pergunta: "tickets" });

  assert.deepEqual(decision, { resposta: "Pode dizer qual período você quer ver?" });
});

test("interpretQuestion lança AgentError se o LLM não chamar tool nem devolver texto", async () => {
  const llm = { async chat() { return { message: { role: "assistant", content: "" } }; } };

  await assert.rejects(
    () => interpretQuestion({ llm, llmTools: [], pergunta: "x" }),
    (error) => error instanceof AgentError && error.code === "resposta_modelo_vazia",
  );
});

test("interpretQuestion marca synthesize:'resumo_ticket' quando a pergunta pede resumo e a tool é buscar_ticket_por_numero", async () => {
  const llm = {
    async chat() {
      return {
        message: {
          role: "assistant",
          content: "",
          tool_calls: [{ function: { name: "buscar_ticket_por_numero", arguments: { numero: 4830 } } }],
        },
      };
    },
  };

  const decision = await interpretQuestion({ llm, llmTools: [], pergunta: "Resuma o ticket 4830." });

  assert.equal(decision.synthesize, "resumo_ticket");
});

test("interpretQuestion marca synthesize:'resumo_executivo' quando a pergunta pede resumo executivo e a tool é resumo_operacional_tickets", async () => {
  const llm = {
    async chat() {
      return {
        message: {
          role: "assistant",
          content: "",
          tool_calls: [{ function: { name: "resumo_operacional_tickets", arguments: {} } }],
        },
      };
    },
  };

  const decision = await interpretQuestion({ llm, llmTools: [], pergunta: "Resumo executivo dos tickets." });

  assert.equal(decision.synthesize, "resumo_executivo");
});

test("interpretQuestion devolve {compare} quando o LLM chama a mesma tool 2 vezes na mesma resposta", async () => {
  const llm = {
    async chat() {
      return {
        message: {
          role: "assistant",
          content: "",
          tool_calls: [
            { function: { name: "analisar_carga_operador", arguments: { operador: "Fábio Gali" } } },
            { function: { name: "analisar_carga_operador", arguments: { operador: "Cesar Augusto" } } },
          ],
        },
      };
    },
  };

  const decision = await interpretQuestion({
    llm,
    llmTools: [],
    pergunta: "Compare a carga de trabalho do Fábio Gali com a do Cesar Augusto.",
  });

  assert.deepEqual(decision, {
    compare: [
      { toolName: "analisar_carga_operador", args: { operador: "Fábio Gali" } },
      { toolName: "analisar_carga_operador", args: { operador: "Cesar Augusto" } },
    ],
  });
});

test("interpretQuestion devolve {compare} com 3+ chamadas (ex.: detalhar vários tickets de uma vez)", async () => {
  const llm = {
    async chat() {
      return {
        message: {
          role: "assistant",
          content: "",
          tool_calls: [
            { function: { name: "buscar_ticket_por_numero", arguments: { numero: 100 } } },
            { function: { name: "buscar_ticket_por_numero", arguments: { numero: 200 } } },
            { function: { name: "buscar_ticket_por_numero", arguments: { numero: 300 } } },
          ],
        },
      };
    },
  };

  const decision = await interpretQuestion({ llm, llmTools: [], pergunta: "Detalhe os tickets 100, 200 e 300." });

  assert.equal(decision.compare.length, 3);
});

test("interpretQuestion não marca synthesize quando a pergunta não pede resumo", async () => {
  const llm = {
    async chat() {
      return {
        message: {
          role: "assistant",
          content: "",
          tool_calls: [{ function: { name: "buscar_ticket_por_numero", arguments: { numero: 4830 } } }],
        },
      };
    },
  };

  const decision = await interpretQuestion({ llm, llmTools: [], pergunta: "Detalhe o ticket 4830." });

  assert.equal(decision.synthesize, undefined);
});
