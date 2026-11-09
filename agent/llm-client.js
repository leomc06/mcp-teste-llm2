import { z } from "zod";

const ANTHROPIC_API_BASE_URL = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";

const contentBlockSchema = z.union([
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("tool_use"), id: z.string(), name: z.string(), input: z.record(z.string(), z.unknown()) }),
  // Blocos que a API pode devolver mas que esta camada não usa hoje
  // (ex.: "thinking" em respostas de raciocínio estendido) — aceitos e
  // ignorados na conversão, em vez de rejeitados pelo schema.
  z.object({ type: z.string() }).passthrough(),
]);

const messagesResponseSchema = z.object({
  role: z.literal("assistant"),
  content: z.array(contentBlockSchema),
  stop_reason: z.string().nullable(),
});

const modelsResponseSchema = z.object({
  data: z.array(z.object({ id: z.string() })),
});

// Cliente pro interpretador de pergunta e pra síntese de conteúdo de
// ticket, ambos em nuvem (Claude, via API paga da Anthropic). Contrato:
// `formatTools(mcpTools)` e `chat({messages, tools, signal})` devolvendo
// `{message: {role, content, tool_calls}}` — quem chama (e os testes) não
// precisa conhecer o formato nativo de blocos de conteúdo da Anthropic,
// nem o fato de que ela exige um campo `system` separado em vez de
// `role: "system"` dentro de `messages`.
//
// Só cobre 1 chamada por pergunta (decidir tool+args OU responder texto
// livre) — não há round-trip de `tool_result` porque esta camada nunca
// decide uma 2ª tool a partir do resultado da 1ª (ver Fase 3 do plano:
// quem executa e formata o resultado é o código determinístico, não o
// LLM de novo).
export function createAnthropicClient({
  apiKey,
  model,
  timeoutMs = 30000,
  maxTokens = 1024,
  baseUrl = ANTHROPIC_API_BASE_URL,
}) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  async function request(path, { method = "GET", body, signal } = {}) {
    let response;

    try {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

      response = await fetch(`${normalizedBaseUrl}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: combinedSignal,
      });
    } catch (error) {
      if (error?.name === "TimeoutError" || error?.name === "AbortError") {
        throw new Error("Timeout ao consultar a API da Anthropic.");
      }

      throw new Error("Não foi possível conectar à API da Anthropic.");
    }

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error("API da Anthropic retornou JSON inválido.");
    }

    if (!response.ok) {
      const motivo = data?.error?.message ?? `HTTP ${response.status}`;
      throw new Error(`API da Anthropic retornou erro: ${motivo}`);
    }

    return data;
  }

  return {
    model,

    // Conversão direta: o JSON Schema das tools MCP (`tool.inputSchema`,
    // gerado pelo SDK a partir dos schemas Zod em `src/server.js`) já é o
    // formato que a Anthropic espera em `input_schema` — mesma estrutura,
    // só muda o nome do campo.
    formatTools(mcpTools) {
      return mcpTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      }));
    },

    // Health-check sem custo: /v1/models não cobra tokens, só confirma que
    // a key é válida e a API está acessível.
    async check() {
      const data = await request("/v1/models?limit=1");
      const parsed = modelsResponseSchema.parse(data);

      return { ok: parsed.data.length >= 0 };
    },

    async chat({ messages, tools = [], signal }) {
      const systemMessages = messages.filter((message) => message.role === "system");
      const demaisMensagens = messages.filter((message) => message.role !== "system");

      const data = await request("/v1/messages", {
        method: "POST",
        signal,
        body: {
          model,
          max_tokens: maxTokens,
          ...(systemMessages.length > 0
            ? { system: systemMessages.map((message) => message.content).join("\n\n") }
            : {}),
          messages: demaisMensagens.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          ...(tools.length > 0 ? { tools } : {}),
        },
      });

      const parsed = messagesResponseSchema.parse(data);

      const textos = parsed.content
        .filter((bloco) => bloco.type === "text")
        .map((bloco) => bloco.text);
      const chamadasDeTool = parsed.content.filter((bloco) => bloco.type === "tool_use");

      return {
        message: {
          role: "assistant",
          content: textos.join("\n"),
          ...(chamadasDeTool.length > 0
            ? {
                tool_calls: chamadasDeTool.map((bloco) => ({
                  id: bloco.id,
                  function: { name: bloco.name, arguments: bloco.input },
                })),
              }
            : {}),
        },
        done: true,
      };
    },
  };
}
