import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const allowedToolNames = new Set([
  "buscar_os_por_numero",
  "listar_os_abertas",
  "listar_os_recentes",
  "listar_os_por_status",
  "listar_os_por_prioridade",
  "listar_os_atrasadas",
  "listar_os_por_responsavel",
  "listar_os_por_solicitante",
  "listar_os_por_cliente",
  "consultar_historico_os",
  "listar_historico_os",
  "resumo_os_por_status",
  "resumo_os_por_prioridade",
  "resumo_geral_os",
  "resumo_os_por_responsavel",
  "resumo_os_por_solicitante",
  "tempo_medio_resolucao_os",

  "listar_clientes",
  "listar_clientes_inativos",
  "listar_clientes_recentes",
  "buscar_cliente_por_id",
  "buscar_cliente_por_email",
  "buscar_clientes_por_nome",
  "listar_dominios_email",
  "resumo_clientes",
  "resumo_clientes_por_mes",

  "listar_areas_tickets",
  "listar_prioridades_tickets",
  "listar_canais_tickets",
  "listar_status_tickets",
  "listar_departamentos_tickets",
  "listar_usuarios_tickets",
  "buscar_ticket_por_numero",
  "listar_tickets",
  "resumo_tickets_por_status",
  "resumo_tickets_por_prioridade",
  "resumo_tickets_por_area",
  "listar_tickets_congelados",
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
