import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";

import { createOllamaClient } from "../agent/ollama-client.js";

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  };
}

function client(overrides = {}) {
  return createOllamaClient({
    baseUrl: "http://127.0.0.1:11434",
    model: "qwen2.5:3b",
    timeoutMs: 5000,
    numThread: 2,
    ...overrides,
  });
}

afterEach(() => {
  mock.restoreAll();
});

test("baseUrl com barra final é normalizado", async () => {
  mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, "http://127.0.0.1:11434/api/version");
    return jsonResponse({ version: "0.1.0" });
  });

  await client({ baseUrl: "http://127.0.0.1:11434///" }).check();
});

test("check() valida o formato da resposta (versionResponseSchema)", async () => {
  mock.method(globalThis, "fetch", async () => jsonResponse({ version: "0.5.1" }));

  const result = await client().check();
  assert.deepEqual(result, { version: "0.5.1" });
});

test("check() rejeita resposta que não bate com o schema esperado", async () => {
  mock.method(globalThis, "fetch", async () => jsonResponse({ semVersao: true }));

  await assert.rejects(() => client().check());
});

test("chat() envia model/messages/tools/temperature 0/num_thread no corpo", async () => {
  mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "http://127.0.0.1:11434/api/chat");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["Content-Type"], "application/json");

    const body = JSON.parse(options.body);
    assert.equal(body.model, "qwen2.5:3b");
    assert.deepEqual(body.messages, [{ role: "user", content: "oi" }]);
    assert.equal(body.tools, undefined);
    assert.equal(body.options.temperature, 0);
    assert.equal(body.options.num_thread, 2);
    assert.equal(body.stream, false);

    return jsonResponse({ message: { role: "assistant", content: "olá" }, done: true });
  });

  const result = await client().chat({ messages: [{ role: "user", content: "oi" }] });
  assert.equal(result.message.content, "olá");
});

test("chat() retorna tool_calls quando presentes", async () => {
  mock.method(globalThis, "fetch", async () =>
    jsonResponse({
      message: {
        role: "assistant",
        content: "",
        tool_calls: [{ function: { name: "listar_tickets", arguments: { limite: 5 } } }],
      },
      done: true,
    }));

  const result = await client().chat({ messages: [] });
  assert.equal(result.message.tool_calls[0].function.name, "listar_tickets");
});

test("chat() rejeita resposta que não bate com chatResponseSchema", async () => {
  mock.method(globalThis, "fetch", async () => jsonResponse({ message: { role: "user", content: "x" }, done: true }));

  await assert.rejects(() => client().chat({ messages: [] }));
});

test("timeout (AbortSignal) vira mensagem de timeout específica do Ollama", async () => {
  mock.method(globalThis, "fetch", async () => {
    const error = new Error("aborted");
    error.name = "TimeoutError";
    throw error;
  });

  await assert.rejects(() => client().check(), /Timeout ao consultar o Ollama\./);
});

test("erro de rede vira mensagem de conexão específica do Ollama", async () => {
  mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });

  await assert.rejects(() => client().check(), /Não foi possível conectar ao Ollama\./);
});

test("HTTP não-ok vira mensagem com o status", async () => {
  mock.method(globalThis, "fetch", async () => jsonResponse({}, { ok: false, status: 503 }));

  await assert.rejects(() => client().check(), /Ollama retornou HTTP 503\./);
});

test("JSON inválido na resposta vira mensagem específica", async () => {
  mock.method(globalThis, "fetch", async () =>
    ({
      ok: true,
      status: 200,
      async json() {
        throw new SyntaxError("bad json");
      },
    }));

  await assert.rejects(() => client().check(), /Ollama retornou JSON inválido\./);
});

test("formatTools converte tools MCP para o formato de function-calling do Ollama", () => {
  const mcpTools = [
    { name: "listar_areas_tickets", description: "lista áreas", inputSchema: { type: "object", properties: {} } },
  ];

  const formatted = client().formatTools(mcpTools);

  assert.deepEqual(formatted, [
    {
      type: "function",
      function: {
        name: "listar_areas_tickets",
        description: "lista áreas",
        parameters: { type: "object", properties: {} },
      },
    },
  ]);
});
