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

// Casa nomes ignorando maiúscula/minúscula e acentuação (ex.: "supercomputacao"
// == "Supercomputação"), já que quem pergunta raramente digita acentos.
function normalizeForMatch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Remove uma terminação de gênero/número (o/a/os/as) pra permitir casar
// variações como "encerrado" com "ENCERRADA", sem exigir concordância exata.
function stripGenderSuffix(value) {
  return value.replace(/(os|as|o|a)$/u, "");
}

async function resolveMetaId(listFn, nome) {
  if (nome === undefined) {
    return { id: undefined, nomeCanonico: undefined, naoEncontrado: false };
  }

  const alvo = normalizeForMatch(nome);
  const itens = await listFn();
  const normalizados = itens.map((candidato) => normalizeForMatch(candidato.name));

  const item =
    itens.find((candidato, i) => normalizados[i] === alvo)
    ?? itens.find((candidato, i) => normalizados[i].includes(alvo))
    ?? itens.find((candidato, i) => stripGenderSuffix(normalizados[i]) === stripGenderSuffix(alvo));

  return item
    ? { id: item.id, nomeCanonico: item.name, naoEncontrado: false }
    : { id: undefined, nomeCanonico: undefined, naoEncontrado: true };
}

async function fetchAllTicketsSafe(filtros, options) {
  try {
    return await ticketsApi.fetchAllTickets(filtros, options);
  } catch (error) {
    if (error.status === 400 && error.type === "not_found") {
      return { tickets: [], truncado: false };
    }

    throw error;
  }
}

async function listTicketsSafe(filtros) {
  try {
    return await ticketsApi.listTickets(filtros);
  } catch (error) {
    if (error.status === 400 && error.type === "not_found") {
      return { results: 0, page: filtros.page ?? 1, pages: 1, tickets: [] };
    }

    throw error;
  }
}

// A API não filtra tickets por período de abertura, então filtramos
// localmente. opening_date é uma string "AAAA-MM-DD HH:MM:SS", comparável
// lexicograficamente com as datas AAAA-MM-DD informadas.
function filtrarPorPeriodo(tickets, dataInicio, dataFim) {
  if (dataInicio === undefined && dataFim === undefined) {
    return tickets;
  }

  const limiteFim = dataFim === undefined ? undefined : `${dataFim} 23:59:59`;

  return tickets.filter(
    (ticket) =>
      (dataInicio === undefined || ticket.opening_date >= dataInicio)
      && (limiteFim === undefined || ticket.opening_date <= limiteFim),
  );
}

// Mesma lógica de filtrarPorPeriodo, mas por data de FECHAMENTO — usada só
// em listar_tickets_fechados: "fechados esse mês"/"resolveu essa semana"
// significa filtrar por quando o ticket foi encerrado, não por quando foi
// aberto (que pode ter sido bem antes do período perguntado).
function filtrarPorPeriodoFechamento(tickets, dataInicio, dataFim) {
  if (dataInicio === undefined && dataFim === undefined) {
    return tickets;
  }

  const limiteFim = dataFim === undefined ? undefined : `${dataFim} 23:59:59`;

  return tickets.filter(
    (ticket) =>
      (dataInicio === undefined || (ticket.closure_date ?? "") >= dataInicio)
      && (limiteFim === undefined || (ticket.closure_date ?? "") <= limiteFim),
  );
}

// Conta tickets de prioridade alta ou urgente entre os tickets abertos.
function contarPrioridadeAltaOuUrgente(tickets) {
  return tickets.filter((ticket) => ticket.priority === "Alta" || ticket.priority === "Urgente").length;
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
  "buscar_usuarios_por_nome",
  {
    title: "Buscar usuários por nome",
    description: "Busca usuários (operadores) do sistema de tickets cujo nome ou login contenham o texto informado.",
    inputSchema: { nome: z.string().trim().min(1).max(100) },
  },
  async ({ nome }) => {
    try {
      const usuarios = await ticketsApi.listUsers();
      const alvo = normalizeForMatch(nome);

      const encontrados = usuarios.filter(
        (usuario) =>
          normalizeForMatch(usuario.name).includes(alvo)
          || normalizeForMatch(usuario.login).includes(alvo),
      );

      return success({ quantidade: encontrados.length, usuarios: encontrados });
    } catch (error) {
      return ticketsFailure(error);
    }
  },
);

server.registerTool(
  "buscar_ticket_por_numero",
  {
    title: "Buscar ticket por número",
    description: "Busca o detalhe completo de um ticket (chamado) pelo número, incluindo SLA, comentários e anexos. Use sempre que a pergunta citar um número de ticket específico, mesmo que outros filtros também apareçam na frase.",
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
    description: "Lista tickets (chamados), com filtros opcionais por status, área, departamento, operador responsável, cliente (nome do solicitante), prioridade, número e período de abertura (dataInicio/dataFim, formato AAAA-MM-DD ou por extenso). Não filtra por coluna do Kanban. Use para listar registros individuais; para perguntas de contagem/agrupamento (\"quantos\", \"por status\", \"por área\" etc.) prefira as tools resumo_tickets_por_*.",
    inputSchema: {
      status: z.string().trim().min(1).max(100).optional(),
      area: z.string().trim().min(1).max(100).optional(),
      departamento: z.string().trim().min(1).max(100).optional(),
      operador: z.string().trim().min(1).max(100).optional(),
      cliente: z.string().trim().min(1).max(100).optional(),
      prioridade: z.string().trim().min(1).max(100).optional(),
      numero: z.number().int().positive().max(2147483647).optional(),
      dataInicio: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/u, "Use o formato AAAA-MM-DD.").optional(),
      dataFim: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/u, "Use o formato AAAA-MM-DD.").optional(),
      limite: z.number().int().min(1).max(100).default(50),
      pagina: z.number().int().min(1).default(1),
    },
  },
  async ({ status, area, departamento, operador, cliente, prioridade, numero, dataInicio, dataFim, limite, pagina }) => {
    try {
      const [statusResolvido, areaResolvida, departamentoResolvido, operadorResolvido, prioridadeResolvida] =
        await Promise.all([
          resolveMetaId(() => ticketsApi.listStatuses(), status),
          resolveMetaId(() => ticketsApi.listAreas(), area),
          resolveMetaId(() => ticketsApi.listDepartments(), departamento),
          resolveMetaId(() => ticketsApi.listUsers(), operador),
          resolveMetaId(() => ticketsApi.listPriorities(), prioridade),
        ]);

      const naoEncontrados = [
        statusResolvido.naoEncontrado ? `status "${status}"` : null,
        areaResolvida.naoEncontrado ? `área "${area}"` : null,
        departamentoResolvido.naoEncontrado ? `departamento "${departamento}"` : null,
        operadorResolvido.naoEncontrado ? `operador "${operador}"` : null,
        prioridadeResolvida.naoEncontrado ? `prioridade "${prioridade}"` : null,
      ].filter(Boolean);

      if (naoEncontrados.length > 0) {
        return success({
          encontrado: false,
          motivo: `Não encontrado(s): ${naoEncontrados.join(", ")}.`,
        });
      }

      const filtrosBase = {
        status: statusResolvido.id,
        area: areaResolvida.id,
        department: departamentoResolvido.id,
        operator: operadorResolvido.id,
      };

      const filtros = { status, area, departamento, operador, cliente, prioridade, numero, dataInicio, dataFim, limite, pagina };
      const precisaFiltroLocal =
        cliente !== undefined || prioridade !== undefined || dataInicio !== undefined || dataFim !== undefined;

      if (!precisaFiltroLocal) {
        const resultado = await listTicketsSafe({
          ...filtrosBase,
          number: numero,
          limit: limite,
          page: pagina,
        });

        return success({
          filtros,
          total: resultado.results,
          pagina: resultado.page,
          paginas: resultado.pages,
          tickets: resultado.tickets ?? [],
        });
      }

      // A API não filtra tickets por cliente, prioridade nem por período de
      // abertura, então buscamos tudo com os demais filtros e filtramos/
      // paginamos localmente. opening_date é uma string "AAAA-MM-DD HH:MM:SS",
      // então dá pra comparar lexicograficamente com as datas AAAA-MM-DD
      // informadas.
      const { tickets: todos, truncado } = await fetchAllTicketsSafe(filtrosBase);

      const clienteAlvo = cliente === undefined ? undefined : normalizeForMatch(cliente);
      const limiteFim = dataFim === undefined ? undefined : `${dataFim} 23:59:59`;

      const filtrados = todos.filter(
        (ticket) =>
          (prioridade === undefined || ticket.priority === prioridadeResolvida.nomeCanonico)
          && (numero === undefined || ticket.number === numero)
          && (clienteAlvo === undefined || normalizeForMatch(ticket.contact_name).includes(clienteAlvo))
          && (dataInicio === undefined || ticket.opening_date >= dataInicio)
          && (limiteFim === undefined || ticket.opening_date <= limiteFim),
      );

      const inicio = (pagina - 1) * limite;
      const totalPaginas = Math.max(Math.ceil(filtrados.length / limite), 1);

      return success({
        filtros,
        total: filtrados.length,
        pagina,
        paginas: totalPaginas,
        truncado,
        tickets: filtrados.slice(inicio, inicio + limite),
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
    description: "Agrupa os tickets (chamados) por status e informa a quantidade em cada um, além do total de tickets abertos e fechados, com filtros opcionais por área, departamento e operador.",
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

      const { tickets, truncado } = await fetchAllTicketsSafe({
        area: areaResolvida.id,
        department: departamentoResolvido.id,
        operator: operadorResolvido.id,
      });

      const contagem = new Map();
      let abertos = 0;
      let fechados = 0;

      for (const ticket of tickets) {
        const chave = ticket.status ?? "não informado";
        contagem.set(chave, (contagem.get(chave) ?? 0) + 1);

        if (ticket.closure_date) {
          fechados += 1;
        } else {
          abertos += 1;
        }
      }

      return success({
        filtros: { area, departamento, operador },
        total_tickets: tickets.length,
        truncado,
        abertos,
        fechados,
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
    description: "Agrupa os tickets (chamados) por prioridade e informa a quantidade em cada uma, além do total de tickets abertos e fechados, com filtros opcionais por status, área, departamento e operador.",
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

      const { tickets, truncado } = await fetchAllTicketsSafe({
        status: statusResolvido.id,
        area: areaResolvida.id,
        department: departamentoResolvido.id,
        operator: operadorResolvido.id,
      });

      const contagem = new Map();
      let abertos = 0;
      let fechados = 0;

      for (const ticket of tickets) {
        const chave = ticket.priority ?? "não informada";
        contagem.set(chave, (contagem.get(chave) ?? 0) + 1);

        if (ticket.closure_date) {
          fechados += 1;
        } else {
          abertos += 1;
        }
      }

      return success({
        filtros: { status, area, departamento, operador },
        total_tickets: tickets.length,
        truncado,
        abertos,
        fechados,
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
    description: "Agrupa os tickets (chamados) por área e informa a quantidade em cada uma, além do total de tickets abertos e fechados, com filtros opcionais por status, departamento e operador.",
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

      const { tickets, truncado } = await fetchAllTicketsSafe({
        status: statusResolvido.id,
        department: departamentoResolvido.id,
        operator: operadorResolvido.id,
      });

      const contagem = new Map();
      let abertos = 0;
      let fechados = 0;

      for (const ticket of tickets) {
        const chave = ticket.area ?? "não informada";
        contagem.set(chave, (contagem.get(chave) ?? 0) + 1);

        if (ticket.closure_date) {
          fechados += 1;
        } else {
          abertos += 1;
        }
      }

      return success({
        filtros: { status, departamento, operador },
        total_tickets: tickets.length,
        truncado,
        abertos,
        fechados,
        resumo: [...contagem.entries()].map(([chave, quantidade]) => ({ chave, quantidade })),
      });
    } catch (error) {
      return ticketsFailure(error);
    }
  },
);

server.registerTool(
  "resumo_tickets_por_operador",
  {
    title: "Resumo de tickets por operador",
    description: "Agrupa os tickets (chamados) por operador responsável e informa a quantidade em cada um, com filtros opcionais por status, área, departamento e situação (aberto/fechado). Use para perguntas como \"quais operadores têm mais tickets?\", \"quantos tickets cada operador possui?\" ou \"quem tem mais chamados em aberto?\".",
    inputSchema: {
      status: z.string().trim().min(1).max(100).optional(),
      area: z.string().trim().min(1).max(100).optional(),
      departamento: z.string().trim().min(1).max(100).optional(),
      situacao: z.enum(["aberto", "fechado"]).optional(),
    },
  },
  async ({ status, area, departamento, situacao }) => {
    try {
      const [statusResolvido, areaResolvida, departamentoResolvido] = await Promise.all([
        resolveMetaId(() => ticketsApi.listStatuses(), status),
        resolveMetaId(() => ticketsApi.listAreas(), area),
        resolveMetaId(() => ticketsApi.listDepartments(), departamento),
      ]);

      const naoEncontrados = [
        statusResolvido.naoEncontrado ? `status "${status}"` : null,
        areaResolvida.naoEncontrado ? `área "${area}"` : null,
        departamentoResolvido.naoEncontrado ? `departamento "${departamento}"` : null,
      ].filter(Boolean);

      if (naoEncontrados.length > 0) {
        return success({
          encontrado: false,
          motivo: `Não encontrado(s): ${naoEncontrados.join(", ")}.`,
        });
      }

      const { tickets: todos, truncado } = await fetchAllTicketsSafe({
        status: statusResolvido.id,
        area: areaResolvida.id,
        department: departamentoResolvido.id,
      });

      const tickets = todos.filter((ticket) => {
        if (situacao === "aberto") {
          return !ticket.closure_date;
        }

        if (situacao === "fechado") {
          return Boolean(ticket.closure_date);
        }

        return true;
      });

      const contagem = new Map();

      for (const ticket of tickets) {
        const chave = ticket.operator ?? "não atribuído";
        contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
      }

      return success({
        filtros: { status, area, departamento, situacao },
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
  "resumo_tickets_por_departamento",
  {
    title: "Resumo de tickets por departamento",
    description: "Conta os tickets (chamados) de cada departamento cadastrado, com filtros opcionais por status, área e operador. Use para perguntas como \"quantos tickets existem em cada departamento?\".",
    inputSchema: {
      status: z.string().trim().min(1).max(100).optional(),
      area: z.string().trim().min(1).max(100).optional(),
      operador: z.string().trim().min(1).max(100).optional(),
    },
  },
  async ({ status, area, operador }) => {
    try {
      const [statusResolvido, areaResolvida, operadorResolvido, departamentos] = await Promise.all([
        resolveMetaId(() => ticketsApi.listStatuses(), status),
        resolveMetaId(() => ticketsApi.listAreas(), area),
        resolveMetaId(() => ticketsApi.listUsers(), operador),
        ticketsApi.listDepartments(),
      ]);

      const naoEncontrados = [
        statusResolvido.naoEncontrado ? `status "${status}"` : null,
        areaResolvida.naoEncontrado ? `área "${area}"` : null,
        operadorResolvido.naoEncontrado ? `operador "${operador}"` : null,
      ].filter(Boolean);

      if (naoEncontrados.length > 0) {
        return success({
          encontrado: false,
          motivo: `Não encontrado(s): ${naoEncontrados.join(", ")}.`,
        });
      }

      const filtrosBase = {
        status: statusResolvido.id,
        area: areaResolvida.id,
        operator: operadorResolvido.id,
      };

      async function contarTickets(filtros) {
        try {
          const resultado = await ticketsApi.listTickets({ ...filtros, limit: 1, page: 1 });
          return resultado.results ?? 0;
        } catch (error) {
          if (error.status === 400 && error.type === "not_found") {
            return 0;
          }

          throw error;
        }
      }

      const [totalGeral, ...porDepartamento] = await Promise.all([
        contarTickets(filtrosBase),
        ...departamentos.map((departamento) =>
          contarTickets({ ...filtrosBase, department: departamento.id }).then(
            (quantidade) => ({ chave: departamento.name, quantidade }),
          ),
        ),
      ]);

      const somaDepartamentos = porDepartamento.reduce((soma, item) => soma + item.quantidade, 0);
      const semDepartamento = Math.max(totalGeral - somaDepartamentos, 0);

      const resumo = [...porDepartamento];

      if (semDepartamento > 0) {
        resumo.push({ chave: "não atribuído", quantidade: semDepartamento });
      }

      return success({
        filtros: { status, area, operador },
        total_tickets: totalGeral,
        truncado: false,
        resumo,
      });
    } catch (error) {
      return ticketsFailure(error);
    }
  },
);

server.registerTool(
  "listar_tickets_sem_operador",
  {
    title: "Listar tickets sem operador atribuído",
    description: "Lista e conta os tickets (chamados) que ainda não têm operador atribuído, com filtros opcionais por status, área, departamento, período de abertura (dataInicio/dataFim) e limite de resultados.",
    inputSchema: {
      status: z.string().trim().min(1).max(100).optional(),
      area: z.string().trim().min(1).max(100).optional(),
      departamento: z.string().trim().min(1).max(100).optional(),
      dataInicio: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/u, "Use o formato AAAA-MM-DD.").optional(),
      dataFim: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/u, "Use o formato AAAA-MM-DD.").optional(),
      limite: z.number().int().min(1).max(100).optional(),
    },
  },
  async ({ status, area, departamento, dataInicio, dataFim, limite }) => {
    try {
      const [statusResolvido, areaResolvida, departamentoResolvido] = await Promise.all([
        resolveMetaId(() => ticketsApi.listStatuses(), status),
        resolveMetaId(() => ticketsApi.listAreas(), area),
        resolveMetaId(() => ticketsApi.listDepartments(), departamento),
      ]);

      const naoEncontrados = [
        statusResolvido.naoEncontrado ? `status "${status}"` : null,
        areaResolvida.naoEncontrado ? `área "${area}"` : null,
        departamentoResolvido.naoEncontrado ? `departamento "${departamento}"` : null,
      ].filter(Boolean);

      if (naoEncontrados.length > 0) {
        return success({
          encontrado: false,
          motivo: `Não encontrado(s): ${naoEncontrados.join(", ")}.`,
        });
      }

      const { tickets, truncado } = await fetchAllTicketsSafe({
        status: statusResolvido.id,
        area: areaResolvida.id,
        department: departamentoResolvido.id,
      });

      const semOperador = filtrarPorPeriodo(
        tickets.filter((ticket) => !ticket.operator || !ticket.operator.trim()),
        dataInicio,
        dataFim,
      );

      return success({
        quantidade: semOperador.length,
        truncado,
        tickets: limite === undefined ? semOperador : semOperador.slice(0, limite),
      });
    } catch (error) {
      return ticketsFailure(error);
    }
  },
);

server.registerTool(
  "listar_tickets_abertos_mais_antigos",
  {
    title: "Listar tickets abertos mais antigos",
    description: "Lista os tickets (chamados) ainda não encerrados ordenados do mais antigo para o mais novo pela data de abertura, com filtros opcionais por área, departamento e operador.",
    inputSchema: {
      area: z.string().trim().min(1).max(100).optional(),
      departamento: z.string().trim().min(1).max(100).optional(),
      operador: z.string().trim().min(1).max(100).optional(),
      limite: z.number().int().min(1).max(50).default(10),
    },
  },
  async ({ area, departamento, operador, limite }) => {
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

      const { tickets, truncado } = await fetchAllTicketsSafe({
        area: areaResolvida.id,
        department: departamentoResolvido.id,
        operator: operadorResolvido.id,
      });

      const abertos = tickets
        .filter((ticket) => !ticket.closure_date)
        .sort((a, b) => (a.opening_date < b.opening_date ? -1 : a.opening_date > b.opening_date ? 1 : 0));

      return success({
        quantidade_total_abertos: abertos.length,
        truncado,
        tickets: abertos.slice(0, limite),
      });
    } catch (error) {
      return ticketsFailure(error);
    }
  },
);

server.registerTool(
  "listar_tickets_mais_recentes",
  {
    title: "Listar tickets mais recentes",
    description: "Lista os tickets (chamados) mais recentemente abertos, do mais novo para o mais antigo pela data de abertura, com filtros opcionais por status, área, departamento, operador e situação (aberto/fechado).",
    inputSchema: {
      status: z.string().trim().min(1).max(100).optional(),
      area: z.string().trim().min(1).max(100).optional(),
      departamento: z.string().trim().min(1).max(100).optional(),
      operador: z.string().trim().min(1).max(100).optional(),
      situacao: z.enum(["aberto", "fechado"]).optional(),
      limite: z.number().int().min(1).max(50).default(10),
    },
  },
  async ({ status, area, departamento, operador, situacao, limite }) => {
    try {
      const [statusResolvido, areaResolvida, departamentoResolvido, operadorResolvido] = await Promise.all([
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

      const { tickets, truncado } = await fetchAllTicketsSafe({
        status: statusResolvido.id,
        area: areaResolvida.id,
        department: departamentoResolvido.id,
        operator: operadorResolvido.id,
      });

      const porSituacao = tickets.filter((ticket) => {
        if (situacao === "aberto") {
          return !ticket.closure_date;
        }

        if (situacao === "fechado") {
          return Boolean(ticket.closure_date);
        }

        return true;
      });

      const recentes = porSituacao.sort(
        (a, b) => (a.opening_date < b.opening_date ? 1 : a.opening_date > b.opening_date ? -1 : 0),
      );

      return success({
        quantidade_total: recentes.length,
        truncado,
        tickets: recentes.slice(0, limite),
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
    description: "Lista os tickets (chamados) com o relógio de SLA congelado (is_frozen), com filtros opcionais por status, área, departamento, operador, período de abertura (dataInicio/dataFim) e limite de resultados.",
    inputSchema: {
      status: z.string().trim().min(1).max(100).optional(),
      area: z.string().trim().min(1).max(100).optional(),
      departamento: z.string().trim().min(1).max(100).optional(),
      operador: z.string().trim().min(1).max(100).optional(),
      dataInicio: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/u, "Use o formato AAAA-MM-DD.").optional(),
      dataFim: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/u, "Use o formato AAAA-MM-DD.").optional(),
      limite: z.number().int().min(1).max(100).optional(),
    },
  },
  async ({ status, area, departamento, operador, dataInicio, dataFim, limite }) => {
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

      const { tickets, truncado } = await fetchAllTicketsSafe({
        status: statusResolvido.id,
        area: areaResolvida.id,
        department: departamentoResolvido.id,
        operator: operadorResolvido.id,
      });

      const congelados = filtrarPorPeriodo(
        tickets.filter((ticket) => ticket.is_frozen === true),
        dataInicio,
        dataFim,
      );

      return success({
        quantidade: congelados.length,
        truncado,
        tickets: limite === undefined ? congelados : congelados.slice(0, limite),
      });
    } catch (error) {
      return ticketsFailure(error);
    }
  },
);

server.registerTool(
  "listar_tickets_abertos",
  {
    title: "Listar tickets abertos",
    description: "Lista e conta os tickets (chamados) ainda não encerrados (sem data de fechamento), com filtros opcionais por área, departamento, operador, prioridade, período de abertura (dataInicio/dataFim) e limite de resultados.",
    inputSchema: {
      area: z.string().trim().min(1).max(100).optional(),
      departamento: z.string().trim().min(1).max(100).optional(),
      operador: z.string().trim().min(1).max(100).optional(),
      prioridade: z.string().trim().min(1).max(100).optional(),
      dataInicio: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/u, "Use o formato AAAA-MM-DD.").optional(),
      dataFim: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/u, "Use o formato AAAA-MM-DD.").optional(),
      limite: z.number().int().min(1).max(100).optional(),
    },
  },
  async ({ area, departamento, operador, prioridade, dataInicio, dataFim, limite }) => {
    try {
      const [areaResolvida, departamentoResolvido, operadorResolvido, prioridadeResolvida] = await Promise.all([
        resolveMetaId(() => ticketsApi.listAreas(), area),
        resolveMetaId(() => ticketsApi.listDepartments(), departamento),
        resolveMetaId(() => ticketsApi.listUsers(), operador),
        resolveMetaId(() => ticketsApi.listPriorities(), prioridade),
      ]);

      const naoEncontrados = [
        areaResolvida.naoEncontrado ? `área "${area}"` : null,
        departamentoResolvido.naoEncontrado ? `departamento "${departamento}"` : null,
        operadorResolvido.naoEncontrado ? `operador "${operador}"` : null,
        prioridadeResolvida.naoEncontrado ? `prioridade "${prioridade}"` : null,
      ].filter(Boolean);

      if (naoEncontrados.length > 0) {
        return success({
          encontrado: false,
          motivo: `Não encontrado(s): ${naoEncontrados.join(", ")}.`,
        });
      }

      const { tickets, truncado } = await fetchAllTicketsSafe({
        area: areaResolvida.id,
        department: departamentoResolvido.id,
        operator: operadorResolvido.id,
      });

      const abertos = filtrarPorPeriodo(
        tickets.filter(
          (ticket) =>
            !ticket.closure_date
            && (prioridade === undefined || ticket.priority === prioridadeResolvida.nomeCanonico),
        ),
        dataInicio,
        dataFim,
      );

      return success({
        quantidade: abertos.length,
        truncado,
        tickets: limite === undefined ? abertos : abertos.slice(0, limite),
      });
    } catch (error) {
      return ticketsFailure(error);
    }
  },
);

server.registerTool(
  "listar_tickets_fechados",
  {
    title: "Listar tickets fechados",
    description: "Lista e conta os tickets (chamados) já encerrados (com data de fechamento), com filtros opcionais por área, departamento, operador, prioridade, período de fechamento (dataInicio/dataFim) e limite de resultados.",
    inputSchema: {
      area: z.string().trim().min(1).max(100).optional(),
      departamento: z.string().trim().min(1).max(100).optional(),
      operador: z.string().trim().min(1).max(100).optional(),
      prioridade: z.string().trim().min(1).max(100).optional(),
      dataInicio: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/u, "Use o formato AAAA-MM-DD.").optional(),
      dataFim: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/u, "Use o formato AAAA-MM-DD.").optional(),
      limite: z.number().int().min(1).max(100).optional(),
    },
  },
  async ({ area, departamento, operador, prioridade, dataInicio, dataFim, limite }) => {
    try {
      const [areaResolvida, departamentoResolvido, operadorResolvido, prioridadeResolvida] = await Promise.all([
        resolveMetaId(() => ticketsApi.listAreas(), area),
        resolveMetaId(() => ticketsApi.listDepartments(), departamento),
        resolveMetaId(() => ticketsApi.listUsers(), operador),
        resolveMetaId(() => ticketsApi.listPriorities(), prioridade),
      ]);

      const naoEncontrados = [
        areaResolvida.naoEncontrado ? `área "${area}"` : null,
        departamentoResolvido.naoEncontrado ? `departamento "${departamento}"` : null,
        operadorResolvido.naoEncontrado ? `operador "${operador}"` : null,
        prioridadeResolvida.naoEncontrado ? `prioridade "${prioridade}"` : null,
      ].filter(Boolean);

      if (naoEncontrados.length > 0) {
        return success({
          encontrado: false,
          motivo: `Não encontrado(s): ${naoEncontrados.join(", ")}.`,
        });
      }

      const { tickets, truncado } = await fetchAllTicketsSafe({
        area: areaResolvida.id,
        department: departamentoResolvido.id,
        operator: operadorResolvido.id,
      });

      // Diferente de listar_tickets_abertos/congelados/sem_operador, aqui o
      // período filtra por data de FECHAMENTO, não de abertura — "fechados
      // essa semana" precisa achar o que foi encerrado nessa semana, mesmo
      // que tenha sido aberto bem antes.
      const fechados = filtrarPorPeriodoFechamento(
        tickets.filter(
          (ticket) =>
            Boolean(ticket.closure_date)
            && (prioridade === undefined || ticket.priority === prioridadeResolvida.nomeCanonico),
        ),
        dataInicio,
        dataFim,
      );

      return success({
        quantidade: fechados.length,
        truncado,
        tickets: limite === undefined ? fechados : fechados.slice(0, limite),
      });
    } catch (error) {
      return ticketsFailure(error);
    }
  },
);

// Dias corridos desde opening_date ("AAAA-MM-DD HH:MM:SS") até agora.
function diasEmAberto(openingDate) {
  const abertura = new Date(openingDate.replace(" ", "T"));

  return Math.max(Math.floor((Date.now() - abertura.getTime()) / 86400000), 0);
}

server.registerTool(
  "resumo_operacional_tickets",
  {
    title: "Visão geral operacional dos tickets",
    description: "Retorna um retrato geral da operação de tickets (chamados): total, abertos, fechados, sem operador, com SLA congelado, distribuição por prioridade e quantidade de abertos há mais de 7 dias. Use para perguntas amplas de gestão como \"como está a operação?\", \"tem algo preocupante?\" ou \"me dá uma visão geral\", com filtros opcionais por área, departamento e período de abertura (dataInicio/dataFim).",
    inputSchema: {
      area: z.string().trim().min(1).max(100).optional(),
      departamento: z.string().trim().min(1).max(100).optional(),
      dataInicio: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/u, "Use o formato AAAA-MM-DD.").optional(),
      dataFim: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/u, "Use o formato AAAA-MM-DD.").optional(),
    },
  },
  async ({ area, departamento, dataInicio, dataFim }) => {
    try {
      const [areaResolvida, departamentoResolvido] = await Promise.all([
        resolveMetaId(() => ticketsApi.listAreas(), area),
        resolveMetaId(() => ticketsApi.listDepartments(), departamento),
      ]);

      const naoEncontrados = [
        areaResolvida.naoEncontrado ? `área "${area}"` : null,
        departamentoResolvido.naoEncontrado ? `departamento "${departamento}"` : null,
      ].filter(Boolean);

      if (naoEncontrados.length > 0) {
        return success({
          encontrado: false,
          motivo: `Não encontrado(s): ${naoEncontrados.join(", ")}.`,
        });
      }

      const { tickets: todos, truncado } = await fetchAllTicketsSafe({
        area: areaResolvida.id,
        department: departamentoResolvido.id,
      });

      const tickets = filtrarPorPeriodo(todos, dataInicio, dataFim);
      const abertos = tickets.filter((ticket) => !ticket.closure_date);
      const fechados = tickets.filter((ticket) => Boolean(ticket.closure_date));
      const semOperador = tickets.filter((ticket) => !ticket.operator || !ticket.operator.trim());
      const congelados = tickets.filter((ticket) => ticket.is_frozen === true);

      const contagemPrioridade = new Map();

      for (const ticket of tickets) {
        const chave = ticket.priority ?? "não definida";
        contagemPrioridade.set(chave, (contagemPrioridade.get(chave) ?? 0) + 1);
      }

      return success({
        filtros: { area, departamento, dataInicio, dataFim },
        truncado,
        total: tickets.length,
        abertos: abertos.length,
        fechados: fechados.length,
        sem_operador: semOperador.length,
        congelados: congelados.length,
        por_prioridade: [...contagemPrioridade.entries()].map(([chave, quantidade]) => ({ chave, quantidade })),
        abertos_com_mais_de_7_dias: abertos.filter((ticket) => diasEmAberto(ticket.opening_date) > 7).length,
      });
    } catch (error) {
      return ticketsFailure(error);
    }
  },
);

server.registerTool(
  "analisar_carga_operador",
  {
    title: "Analisar carga de trabalho de um operador",
    description: "Retorna a carga de trabalho de um operador específico: total de tickets, abertos, fechados, congelados, quantos são de prioridade alta/urgente e qual o ticket aberto mais antigo dele (com quantos dias em aberto). Use para perguntas como \"o Fábio está sobrecarregado?\" ou \"qual a carga do operador X?\".",
    inputSchema: {
      operador: z.string().trim().min(1).max(100),
    },
  },
  async ({ operador }) => {
    try {
      const operadorResolvido = await resolveMetaId(() => ticketsApi.listUsers(), operador);

      if (operadorResolvido.naoEncontrado) {
        return success({
          encontrado: false,
          motivo: `Não encontrado(s): operador "${operador}".`,
        });
      }

      const { tickets, truncado } = await fetchAllTicketsSafe({
        operator: operadorResolvido.id,
      });

      const abertos = tickets.filter((ticket) => !ticket.closure_date);
      const fechados = tickets.filter((ticket) => Boolean(ticket.closure_date));
      const congelados = tickets.filter((ticket) => ticket.is_frozen === true);

      const maisAntigoAberto = abertos.reduce(
        (mais_antigo, ticket) =>
          mais_antigo === undefined || ticket.opening_date < mais_antigo.opening_date ? ticket : mais_antigo,
        undefined,
      );

      return success({
        operador: operadorResolvido.nomeCanonico,
        truncado,
        total: tickets.length,
        abertos: abertos.length,
        fechados: fechados.length,
        congelados: congelados.length,
        prioridade_alta_ou_urgente: contarPrioridadeAltaOuUrgente(abertos),
        mais_antigo_aberto:
          maisAntigoAberto === undefined
            ? null
            : {
                numero: maisAntigoAberto.number,
                opening_date: maisAntigoAberto.opening_date,
                dias_em_aberto: diasEmAberto(maisAntigoAberto.opening_date),
              },
      });
    } catch (error) {
      return ticketsFailure(error);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
