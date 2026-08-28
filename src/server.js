import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { createTicketsApiClient } from "./tickets-api.js";

const requiredVariables = [
  "TICKETS_API_BASE_URL",
  "TICKETS_API_TOKEN",
  "TICKETS_API_LOGIN",
  "TICKETS_API_APP",
];

for (const variable of requiredVariables) {
  if (!process.env[variable]) {
    console.error(`Variável obrigatória ausente: ${variable}`);
    process.exit(1);
  }
}

const ticketsApi = createTicketsApiClient({
  baseUrl: process.env.TICKETS_API_BASE_URL,
  token: process.env.TICKETS_API_TOKEN,
  login: process.env.TICKETS_API_LOGIN,
  app: process.env.TICKETS_API_APP,
  timeoutMs: Number(process.env.TICKETS_API_TIMEOUT_MS ?? 10000),
});

const server = new McpServer({ name: "tickets-mcp", version: "1.0.0" });

function success(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function ticketsFailure(error) {
  console.error(`Erro na ferramenta MCP de tickets: ${error?.message ?? error}`);

  return {
    content: [
      {
        type: "text",
        text: "Não foi possível consultar a API de tickets.",
      },
    ],
    isError: true,
  };
}

async function resolveMetaId(listFn, nome) {
  if (nome === undefined) {
    return { id: undefined, naoEncontrado: false };
  }

  const alvo = nome.trim().toLowerCase();
  const itens = await listFn();

  const item = itens.find((candidato) => candidato.name.toLowerCase() === alvo)
    ?? itens.find((candidato) => candidato.name.toLowerCase().includes(alvo));

  return item
    ? { id: item.id, naoEncontrado: false }
    : { id: undefined, naoEncontrado: true };
}
server.registerTool(
  "listar_areas_tickets",
  {
    title: "Listar áreas de tickets",
    description: "Lista as áreas cadastradas para tickets (chamados) no sistema de tickets.",
    inputSchema: {},
  },
  async () => {
    try {
      const areas = await ticketsApi.listAreas();
      return success({ quantidade: areas.length, areas });
    } catch (error) {
      return ticketsFailure(error);
    }
  },
);

server.registerTool(
  "listar_prioridades_tickets",
  {
    title: "Listar prioridades de tickets",
    description: "Lista as prioridades cadastradas para tickets (chamados) no sistema de tickets.",
    inputSchema: {},
  },
  async () => {
    try {
      const prioridades = await ticketsApi.listPriorities();
      return success({ quantidade: prioridades.length, prioridades });
    } catch (error) {
      return ticketsFailure(error);
    }
  },
);

server.registerTool(
  "listar_canais_tickets",
  {
    title: "Listar canais de tickets",
    description: "Lista os canais de entrada cadastrados para tickets (chamados) no sistema de tickets.",
    inputSchema: {},
  },
  async () => {
    try {
      const canais = await ticketsApi.listChannels();
      return success({ quantidade: canais.length, canais });
    } catch (error) {
      return ticketsFailure(error);
    }
  },
);

server.registerTool(
  "listar_status_tickets",
  {
    title: "Listar status de tickets",
    description: "Lista os status possíveis para tickets (chamados) no sistema de tickets.",
    inputSchema: {},
  },
  async () => {
    try {
      const status = await ticketsApi.listStatuses();
      return success({ quantidade: status.length, status });
    } catch (error) {
      return ticketsFailure(error);
    }
  },
);

server.registerTool(
  "listar_departamentos_tickets",
  {
    title: "Listar departamentos de tickets",
    description: "Lista os departamentos cadastrados para tickets (chamados) no sistema de tickets.",
    inputSchema: {},
  },
  async () => {
    try {
      const departamentos = await ticketsApi.listDepartments();
      return success({ quantidade: departamentos.length, departamentos });
    } catch (error) {
      return ticketsFailure(error);
    }
  },
);

server.registerTool(
  "listar_usuarios_tickets",
  {
    title: "Listar usuários de tickets",
    description: "Lista os usuários (operadores) cadastrados no sistema de tickets.",
    inputSchema: {},
  },
  async () => {
    try {
      const usuarios = await ticketsApi.listUsers();
      return success({ quantidade: usuarios.length, usuarios });
    } catch (error) {
      return ticketsFailure(error);
    }
  },
);

server.registerTool(
  "buscar_ticket_por_numero",
  {
    title: "Buscar ticket por número",
    description: "Busca o detalhe completo de um ticket (chamado) pelo número, incluindo SLA, comentários e anexos.",
    inputSchema: { numero: z.number().int().positive().max(2147483647) },
  },
  async ({ numero }) => {
    try {
      const ticket = await ticketsApi.getTicket(numero);
      return success({ encontrado: true, ticket });
    } catch (error) {
      if (error.status === 404 || error.type === "not_found") {
        return success({ encontrado: false, ticket: null });
      }

      return ticketsFailure(error);
    }
  },
);

server.registerTool(
  "listar_tickets",
  {
    title: "Listar tickets",
    description: "Lista tickets (chamados), com filtros opcionais por status, área, departamento, operador responsável e número. Não filtra por prioridade nem por coluna do Kanban.",
    inputSchema: {
      status: z.string().trim().min(1).max(100).optional(),
      area: z.string().trim().min(1).max(100).optional(),
      departamento: z.string().trim().min(1).max(100).optional(),
      operador: z.string().trim().min(1).max(100).optional(),
      numero: z.number().int().positive().max(2147483647).optional(),
      limite: z.number().int().min(1).max(100).default(50),
      pagina: z.number().int().min(1).default(1),
    },
  },
  async ({ status, area, departamento, operador, numero, limite, pagina }) => {
    try {
      const [statusResolvido, areaResolvida, departamentoResolvido, operadorResolvido] =
        await Promise.all([
          resolveMetaId(() => ticketsApi.listStatuses(), status),
          resolveMetaId(() => ticketsApi.listAreas(), area),
          resolveMetaId(() => ticketsApi.listDepartments(), departamento),
          resolveMetaId(() => ticketsApi.listUsers(), operador),
        ]);

      const naoEncontrados = [
        statusResolvido.naoEncontrado ? `status "${status}"` : null,
        areaResolvida.naoEncontrado ? `área "${area}"` : null,
        departamentoResolvido.naoEncontrado ? `departamento "${departamento}"` : null,
        operadorResolvido.naoEncontrado ? `operador "${operador}"` : null,
      ].filter(Boolean);

      if (naoEncontrados.length > 0) {
        return success({
          encontrado: false,
          motivo: `Não encontrado(s): ${naoEncontrados.join(", ")}.`,
        });
      }

      const resultado = await ticketsApi.listTickets({
        status: statusResolvido.id,
        area: areaResolvida.id,
        department: departamentoResolvido.id,
        operator: operadorResolvido.id,
        number: numero,
        limit: limite,
        page: pagina,
      });

      return success({
        filtros: { status, area, departamento, operador, numero, limite, pagina },
        total: resultado.results,
        pagina: resultado.page,
        paginas: resultado.pages,
        tickets: resultado.tickets ?? [],
      });
    } catch (error) {
      return ticketsFailure(error);
    }
  },
);

server.registerTool(
  "resumo_tickets_por_status",
  {
    title: "Resumo de tickets por status",
    description: "Agrupa os tickets (chamados) por status e informa a quantidade em cada um, com filtros opcionais por área, departamento e operador.",
    inputSchema: {
      area: z.string().trim().min(1).max(100).optional(),
      departamento: z.string().trim().min(1).max(100).optional(),
      operador: z.string().trim().min(1).max(100).optional(),
    },
  },
  async ({ area, departamento, operador }) => {
    try {
      const [areaResolvida, departamentoResolvido, operadorResolvido] = await Promise.all([
        resolveMetaId(() => ticketsApi.listAreas(), area),
        resolveMetaId(() => ticketsApi.listDepartments(), departamento),
        resolveMetaId(() => ticketsApi.listUsers(), operador),
      ]);

      const naoEncontrados = [
        areaResolvida.naoEncontrado ? `área "${area}"` : null,
        departamentoResolvido.naoEncontrado ? `departamento "${departamento}"` : null,
        operadorResolvido.naoEncontrado ? `operador "${operador}"` : null,
      ].filter(Boolean);

      if (naoEncontrados.length > 0) {
        return success({
          encontrado: false,
          motivo: `Não encontrado(s): ${naoEncontrados.join(", ")}.`,
        });
      }

      const { tickets, truncado } = await ticketsApi.fetchAllTickets({
        area: areaResolvida.id,
        department: departamentoResolvido.id,
        operator: operadorResolvido.id,
      });

      const contagem = new Map();

      for (const ticket of tickets) {
        const chave = ticket.status ?? "não informado";
        contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
      }

      return success({
        filtros: { area, departamento, operador },
        total_tickets: tickets.length,
        truncado,
        resumo: [...contagem.entries()].map(([chave, quantidade]) => ({ chave, quantidade })),
      });
    } catch (error) {
      return ticketsFailure(error);
    }
  },
);

server.registerTool(
  "resumo_tickets_por_prioridade",
  {
    title: "Resumo de tickets por prioridade",
    description: "Agrupa os tickets (chamados) por prioridade e informa a quantidade em cada uma, com filtros opcionais por status, área, departamento e operador.",
    inputSchema: {
      status: z.string().trim().min(1).max(100).optional(),
      area: z.string().trim().min(1).max(100).optional(),
      departamento: z.string().trim().min(1).max(100).optional(),
      operador: z.string().trim().min(1).max(100).optional(),
    },
  },
  async ({ status, area, departamento, operador }) => {
    try {
      const [statusResolvido, areaResolvida, departamentoResolvido, operadorResolvido] =
        await Promise.all([
          resolveMetaId(() => ticketsApi.listStatuses(), status),
          resolveMetaId(() => ticketsApi.listAreas(), area),
          resolveMetaId(() => ticketsApi.listDepartments(), departamento),
          resolveMetaId(() => ticketsApi.listUsers(), operador),
        ]);

      const naoEncontrados = [
        statusResolvido.naoEncontrado ? `status "${status}"` : null,
        areaResolvida.naoEncontrado ? `área "${area}"` : null,
        departamentoResolvido.naoEncontrado ? `departamento "${departamento}"` : null,
        operadorResolvido.naoEncontrado ? `operador "${operador}"` : null,
      ].filter(Boolean);

      if (naoEncontrados.length > 0) {
        return success({
          encontrado: false,
          motivo: `Não encontrado(s): ${naoEncontrados.join(", ")}.`,
        });
      }

      const { tickets, truncado } = await ticketsApi.fetchAllTickets({
        status: statusResolvido.id,
        area: areaResolvida.id,
        department: departamentoResolvido.id,
        operator: operadorResolvido.id,
      });

      const contagem = new Map();

      for (const ticket of tickets) {
        const chave = ticket.priority ?? "não informada";
        contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
      }

      return success({
        filtros: { status, area, departamento, operador },
        total_tickets: tickets.length,
        truncado,
        resumo: [...contagem.entries()].map(([chave, quantidade]) => ({ chave, quantidade })),
      });
    } catch (error) {
      return ticketsFailure(error);
    }
  },
);

server.registerTool(
  "resumo_tickets_por_area",
  {
    title: "Resumo de tickets por área",
    description: "Agrupa os tickets (chamados) por área e informa a quantidade em cada uma, com filtros opcionais por status, departamento e operador.",
    inputSchema: {
      status: z.string().trim().min(1).max(100).optional(),
      departamento: z.string().trim().min(1).max(100).optional(),
      operador: z.string().trim().min(1).max(100).optional(),
    },
  },
  async ({ status, departamento, operador }) => {
    try {
      const [statusResolvido, departamentoResolvido, operadorResolvido] = await Promise.all([
        resolveMetaId(() => ticketsApi.listStatuses(), status),
        resolveMetaId(() => ticketsApi.listDepartments(), departamento),
        resolveMetaId(() => ticketsApi.listUsers(), operador),
      ]);

      const naoEncontrados = [
        statusResolvido.naoEncontrado ? `status "${status}"` : null,
        departamentoResolvido.naoEncontrado ? `departamento "${departamento}"` : null,
        operadorResolvido.naoEncontrado ? `operador "${operador}"` : null,
      ].filter(Boolean);

      if (naoEncontrados.length > 0) {
        return success({
          encontrado: false,
          motivo: `Não encontrado(s): ${naoEncontrados.join(", ")}.`,
        });
      }

      const { tickets, truncado } = await ticketsApi.fetchAllTickets({
        status: statusResolvido.id,
        department: departamentoResolvido.id,
        operator: operadorResolvido.id,
      });

      const contagem = new Map();

      for (const ticket of tickets) {
        const chave = ticket.area ?? "não informada";
        contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
      }

      return success({
        filtros: { status, departamento, operador },
        total_tickets: tickets.length,
        truncado,
        resumo: [...contagem.entries()].map(([chave, quantidade]) => ({ chave, quantidade })),
      });
    } catch (error) {
      return ticketsFailure(error);
    }
  },
);

server.registerTool(
  "listar_tickets_congelados",
  {
    title: "Listar tickets congelados",
    description: "Lista os tickets (chamados) com o relógio de SLA congelado (is_frozen), com filtros opcionais por status, área, departamento e operador.",
    inputSchema: {
      status: z.string().trim().min(1).max(100).optional(),
      area: z.string().trim().min(1).max(100).optional(),
      departamento: z.string().trim().min(1).max(100).optional(),
      operador: z.string().trim().min(1).max(100).optional(),
    },
  },
  async ({ status, area, departamento, operador }) => {
    try {
      const [statusResolvido, areaResolvida, departamentoResolvido, operadorResolvido] =
        await Promise.all([
          resolveMetaId(() => ticketsApi.listStatuses(), status),
          resolveMetaId(() => ticketsApi.listAreas(), area),
          resolveMetaId(() => ticketsApi.listDepartments(), departamento),
          resolveMetaId(() => ticketsApi.listUsers(), operador),
        ]);

      const naoEncontrados = [
        statusResolvido.naoEncontrado ? `status "${status}"` : null,
        areaResolvida.naoEncontrado ? `área "${area}"` : null,
        departamentoResolvido.naoEncontrado ? `departamento "${departamento}"` : null,
        operadorResolvido.naoEncontrado ? `operador "${operador}"` : null,
      ].filter(Boolean);

      if (naoEncontrados.length > 0) {
        return success({
          encontrado: false,
          motivo: `Não encontrado(s): ${naoEncontrados.join(", ")}.`,
        });
      }

      const { tickets, truncado } = await ticketsApi.fetchAllTickets({
        status: statusResolvido.id,
        area: areaResolvida.id,
        department: departamentoResolvido.id,
        operator: operadorResolvido.id,
      });

      const congelados = tickets.filter((ticket) => ticket.is_frozen === true);

      return success({
        quantidade: congelados.length,
        truncado,
        tickets: congelados,
      });
    } catch (error) {
      return ticketsFailure(error);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
