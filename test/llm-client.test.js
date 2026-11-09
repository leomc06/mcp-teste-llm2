import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";

import { createAnthropicClient } from "../agent/llm-client.js";

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
  return createAnthropicClient({
    apiKey: "sk-ant-test",
    model: "claude-haiku-5-5",
    timeoutMs: 5000,
    ...overrides,
  });
}

afterEach(() => {
  mock.restoreAll();
});

test("baseUrl com barra final é normalizado", async () => {
  mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, "http://exemplo.teste/v1/models?limit=1");
    return jsonResponse({ data: [] });
  });

  await client({ baseUrl: "http://exemplo.teste///" }).check();
});

test("check() chama /v1/models com a key e a versão da API nos headers, sem gastar token", async () => {
  mock.method(globalThis, "fetch", async (url, options) => {
    assert.match(url, /\/v1\/models\?limit=1$/);
    assert.equal(options.method, "GET");
    assert.equal(options.headers["x-api-key"], "sk-ant-test");
    assert.equal(options.headers["anthropic-version"], "2023-06-01");

    return jsonResponse({ data: [{ id: "claude-haiku-5-5" }] });
  });

  const result = await client().check();
  assert.deepEqual(result, { ok: true });
});

test("chat() envia model/max_tokens/messages/tools no corpo, com headers de autenticação", async () => {
  mock.method(globalThis, "fetch", async (url, options) => {
    assert.match(url, /\/v1\/messages$/);
    assert.equal(options.method, "POST");
    assert.equal(options.headers["x-api-key"], "sk-ant-test");
    assert.equal(options.headers["content-type"], "application/json");

    const body = JSON.parse(options.body);
    assert.equal(body.model, "claude-haiku-5-5");
    assert.equal(body.max_tokens, 1024);
    assert.deepEqual(body.messages, [{ role: "user", content: "oi" }]);
    assert.equal(body.system, undefined);
    assert.equal(body.tools, undefined);

    return jsonResponse({
      role: "assistant",
      content: [{ type: "text", text: "olá" }],
      stop_reason: "end_turn",
    });
  });

  const result = await client().chat({ messages: [{ role: "user", content: "oi" }] });
  assert.equal(result.message.content, "olá");
  assert.equal(result.message.tool_calls, undefined);
});

test("chat() extrai mensagens com role 'system' pro campo 'system' separado (a Anthropic não aceita role system em messages)", async () => {
  mock.method(globalThis, "fetch", async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.system, "Você é um assistente.");
    assert.deepEqual(body.messages, [{ role: "user", content: "oi" }]);

    return jsonResponse({ role: "assistant", content: [{ type: "text", text: "olá" }], stop_reason: "end_turn" });
  });

  await client().chat({
    messages: [
      { role: "system", content: "Você é um assistente." },
      { role: "user", content: "oi" },
    ],
  });
});

test("chat() repassa as tools formatadas quando presentes", async () => {
  mock.method(globalThis, "fetch", async (url, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(body.tools, [{ name: "listar_tickets", description: "lista", input_schema: {} }]);

    return jsonResponse({ role: "assistant", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" });
  });

  await client().chat({
    messages: [{ role: "user", content: "oi" }],
    tools: [{ name: "listar_tickets", description: "lista", input_schema: {} }],
  });
});

test("chat() converte bloco tool_use em tool_calls no formato normalizado", async () => {
  mock.method(globalThis, "fetch", async () =>
    jsonResponse({
      role: "assistant",
      content: [{ type: "tool_use", id: "toolu_1", name: "listar_tickets", input: { limite: 5 } }],
      stop_reason: "tool_use",
    }));

  const result = await client().chat({ messages: [] });
  assert.equal(result.message.content, "");
  assert.deepEqual(result.message.tool_calls, [
    { id: "toolu_1", function: { name: "listar_tickets", arguments: { limite: 5 } } },
  ]);
});

test("chat() rejeita resposta que não bate com o schema esperado", async () => {
  mock.method(globalThis, "fetch", async () => jsonResponse({ role: "user", content: [], stop_reason: null }));

  await assert.rejects(() => client().chat({ messages: [] }));
});

test("timeout (AbortSignal) vira mensagem de timeout específica da Anthropic", async () => {
  mock.method(globalThis, "fetch", async () => {
    const error = new Error("aborted");
    error.name = "TimeoutError";
    throw error;
  });

  await assert.rejects(() => client().check(), /Timeout ao consultar a API da Anthropic\./);
});

test("erro de rede vira mensagem de conexão específica da Anthropic", async () => {
  mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });

  await assert.rejects(() => client().check(), /Não foi possível conectar à API da Anthropic\./);
});

test("HTTP não-ok vira mensagem com o motivo retornado pela API", async () => {
  mock.method(globalThis, "fetch", async () =>
    jsonResponse({ error: { message: "invalid x-api-key" } }, { ok: false, status: 401 }));

  await assert.rejects(() => client().check(), /API da Anthropic retornou erro: invalid x-api-key/);
});

test("HTTP não-ok sem corpo de erro reconhecível cai no status", async () => {
  mock.method(globalThis, "fetch", async () => jsonResponse({}, { ok: false, status: 503 }));

  await assert.rejects(() => client().check(), /API da Anthropic retornou erro: HTTP 503/);
});

test("JSON inválido na resposta vira mensagem específica", async () => {
  mock.method(globalThis, "fetch", async () => ({
    ok: true,
    status: 200,
    async json() {
      throw new SyntaxError("bad json");
    },
  }));

  await assert.rejects(() => client().check(), /API da Anthropic retornou JSON inválido\./);
});

test("formatTools converte tools MCP para o formato de tool-use da Anthropic (input_schema)", () => {
  const mcpTools = [
    { name: "listar_areas_tickets", description: "lista áreas", inputSchema: { type: "object", properties: {} } },
  ];

  const formatted = client().formatTools(mcpTools);

  assert.deepEqual(formatted, [
    {
      name: "listar_areas_tickets",
      description: "lista áreas",
      input_schema: { type: "object", properties: {} },
    },
  ]);
});
