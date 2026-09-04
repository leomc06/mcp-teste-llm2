import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const allowedToolNames = new Set([
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
  "listar_tickets_mais_recentes",
  "resumo_operacional_tickets",
  "analisar_carga_operador",
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
