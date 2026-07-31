import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const allowedToolNames = new Set([
  "buscar_os_por_numero",
  "listar_os_abertas",
  "listar_os_por_status",
  "listar_os_atrasadas",
  "listar_os_por_responsavel",
  "listar_os_por_solicitante",
  "consultar_historico_os",
  "resumo_os_por_status",
  "resumo_os_por_prioridade",

  "listar_clientes",
  "listar_clientes_inativos",
  "listar_clientes_recentes",
  "buscar_cliente_por_id",
  "buscar_cliente_por_email",
  "buscar_clientes_por_nome",
  "listar_dominios_email",
  "resumo_clientes",
]);

export async function createMcpClient({ projectDir }) {
  const transport = new StdioClientTransport({
    command: "bash",
    args: [`${projectDir}/run-mcp.sh`],
    cwd: projectDir,
  });

  const client = new Client({
    name: "backend-agente-consultas",
    version: "1.0.0",
  });

  await client.connect(transport);

  const result = await client.listTools();

  const tools = result.tools.filter((tool) =>
    allowedToolNames.has(tool.name)
  );

  const availableNames = new Set(
    tools.map((tool) => tool.name),
  );

  const missingTools = [...allowedToolNames].filter(
    (name) => !availableNames.has(name),
  );

  if (missingTools.length > 0) {
    await client.close();

    throw new Error(
      `Tools MCP obrigatórias ausentes: ${missingTools.join(", ")}`,
    );
  }

  return {
    tools,

    async callTool(name, args) {
      if (!allowedToolNames.has(name)) {
        throw new Error("Tool MCP não permitida.");
      }

      return client.callTool({
        name,
        arguments: args,
      });
    },

    async close() {
      await client.close();
    },
  };
}
