import { z } from "zod";

const toolCallSchema = z.object({
  id: z.string().optional(),
  function: z.object({
    name: z.string().min(1),
    arguments: z.record(z.string(), z.unknown()),
  }),
});

const chatResponseSchema = z.object({
  message: z.object({
    role: z.literal("assistant"),
    content: z.string(),
    tool_calls: z.array(toolCallSchema).optional(),
  }),
  done: z.boolean(),
});

const versionResponseSchema = z.object({
  version: z.string().min(1),
});

export function createOllamaClient({
  baseUrl,
  model,
  timeoutMs,
  numThread,
}) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  async function request(path, options = {}) {
    let response;

    try {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal;

      response = await fetch(`${normalizedBaseUrl}${path}`, {
        ...options,
        signal,
      });
    } catch (error) {
      if (
        error?.name === "TimeoutError"
        || error?.name === "AbortError"
      ) {
        throw new Error("Timeout ao consultar o Ollama.");
      }

      throw new Error("Não foi possível conectar ao Ollama.");
    }

    if (!response.ok) {
      throw new Error(`Ollama retornou HTTP ${response.status}.`);
    }

    try {
      return await response.json();
    } catch {
      throw new Error("Ollama retornou JSON inválido.");
    }
  }

  return {
    model,

    formatTools(mcpTools) {
      return mcpTools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));
    },

    async check() {
      const data = await request("/api/version");
      return versionResponseSchema.parse(data);
    },

    async chat({ messages, tools, signal }) {
      const data = await request("/api/chat", {
        signal,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          tools,
          options: {
            temperature: 0,
            num_thread: numThread,
          },
          stream: false,
        }),
      });

      return chatResponseSchema.parse(data);
    },
  };
}
