import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import pg from "pg";
import { z } from "zod";

const { Pool } = pg;

const requiredVariables = ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "MCP_READER_PASSWORD"];

for (const variable of requiredVariables) {
  if (!process.env[variable]) {
    console.error(`Variável obrigatória ausente: ${variable}`);
    process.exit(1);
  }
}

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.MCP_READER_PASSWORD,
  max: 5,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
  application_name: "mcp-teste-llm",
});

const server = new McpServer({ name: "postgres-teste-llm", version: "1.0.0" });

function success(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function failure(error) {
  const code = error?.code ?? "erro_desconhecido";
  console.error(`Erro na ferramenta MCP. Código: ${code}`);

  return {
    content: [
      {
        type: "text",
        text: "Não foi possível consultar o PostgreSQL.",
      },
    ],
    isError: true,
  };
}

function escapeLikePattern(value) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function escapeLikeOrNull(value) {
  return value === undefined || value === null
    ? null
    : escapeLikePattern(value);
}
server.registerTool(
  "buscar_os_por_numero",
  {
    title: "Buscar OS por número",
    description:
      "Consulta uma ordem de serviço pelo número exato e informa seus dados, status, prioridade, prazo e se está atrasada.",
    inputSchema: {
      numero: z.number().int().positive().max(2147483647),
    },
  },
  async ({ numero }) => {
    try {
      const result = await pool.query(
        `
          SELECT
            id,
            numero,
            titulo,
            descricao,
            status,
            prioridade,
            solicitante,
            responsavel,
            aberta_em,
            prazo,
            concluida_em,
            (
              prazo < CURRENT_TIMESTAMP
              AND status NOT IN ('concluida', 'cancelada')
            ) AS atrasada
          FROM ordens_servico
          WHERE numero = $1
        `,
        [numero],
      );

      return success({
        encontrado: result.rowCount > 0,
        ordem_servico: result.rows[0] ?? null,
      });
    } catch (error) {
      return failure(error);
    }
  },
);
server.registerTool(
  "listar_os_abertas",
  {
    title: "Listar OS abertas",
    description:
      "Lista ordens de serviço ainda pendentes, excluindo as concluídas e canceladas. Permite filtrar por responsável e prioridade.",
    inputSchema: {
      responsavel: z.string().trim().min(1).max(150).optional(),
      prioridade: z.enum(["baixa", "media", "alta", "critica"]).optional(),
      limite: z.number().int().min(1).max(100).default(20),
    },
  },
  async ({ responsavel, prioridade, limite }) => {
    try {
      const result = await pool.query(
        `
          SELECT
            id,
            numero,
            titulo,
            status,
            prioridade,
            solicitante,
            responsavel,
            aberta_em,
            prazo,
            (
              prazo < CURRENT_TIMESTAMP
              AND status NOT IN ('concluida', 'cancelada')
            ) AS atrasada
          FROM ordens_servico
          WHERE status NOT IN ('concluida', 'cancelada')
            AND (
              $1::text IS NULL
              OR responsavel ILIKE '%' || $1 || '%'
            )
            AND (
              $2::text IS NULL
              OR prioridade = $2
            )
          ORDER BY
            CASE prioridade
              WHEN 'critica' THEN 1
              WHEN 'alta' THEN 2
              WHEN 'media' THEN 3
              WHEN 'baixa' THEN 4
            END,
            prazo,
            numero
          LIMIT $3
        `,
        [
          escapeLikeOrNull(responsavel),
          prioridade ?? null,
          limite,
        ],
      );

      return success({
        filtros: {
          responsavel: responsavel ?? null,
          prioridade: prioridade ?? null,
          limite,
        },
        quantidade: result.rowCount,
        ordens_servico: result.rows,
      });
    } catch (error) {
      return failure(error);
    }
  },
);
server.registerTool(
  "listar_os_recentes",
  {
    title: "Listar OS recentes",
    description:
      "Lista as ordens de serviço abertas mais recentemente, da mais nova para a mais antiga. Permite filtrar por status e prioridade.",
    inputSchema: {
      status: z
        .enum(["aberta", "em_andamento", "aguardando", "concluida", "cancelada"])
        .optional(),
      prioridade: z.enum(["baixa", "media", "alta", "critica"]).optional(),
      dias: z.number().int().min(1).max(3650).default(3650),
      limite: z.number().int().min(1).max(100).default(20),
    },
  },
  async ({ status, prioridade, dias, limite }) => {
    try {
      const result = await pool.query(
        `
          SELECT
            id,
            numero,
            titulo,
            status,
            prioridade,
            solicitante,
            responsavel,
            aberta_em,
            prazo,
            (
              prazo < CURRENT_TIMESTAMP
              AND status NOT IN ('concluida', 'cancelada')
            ) AS atrasada
          FROM ordens_servico
          WHERE aberta_em >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
            AND (
              $2::text IS NULL
              OR status = $2
            )
            AND (
              $3::text IS NULL
              OR prioridade = $3
            )
          ORDER BY aberta_em DESC, numero DESC
          LIMIT $4
        `,
        [dias, status ?? null, prioridade ?? null, limite],
      );

      return success({
        filtros: {
          status: status ?? null,
          prioridade: prioridade ?? null,
          periodo_dias: dias,
          limite,
        },
        quantidade: result.rowCount,
        ordens_servico: result.rows,
      });
    } catch (error) {
      return failure(error);
    }
  },
);
server.registerTool(
  "listar_os_atrasadas",
  {
    title: "Listar OS atrasadas",
    description:
      "Lista ordens de serviço com prazo vencido que ainda não foram concluídas nem canceladas. Permite filtrar por status, responsável, solicitante e prioridade.",
    inputSchema: {
      status: z
        .enum([
          "aberta",
          "em_andamento",
          "aguardando",
          "concluida",
          "cancelada",
        ])
        .optional(),
      responsavel: z.string().trim().min(1).max(150).optional(),
      solicitante: z.string().trim().min(1).max(150).optional(),
      prioridade: z.enum(["baixa", "media", "alta", "critica"]).optional(),
      dias: z.number().int().min(1).max(3650).default(3650),
      limite: z.number().int().min(1).max(100).default(20),
    },
  },
  async ({ responsavel, solicitante, prioridade, status, dias, limite }) => {
    try {
      const result = await pool.query(
        `
          SELECT
            id,
            numero,
            titulo,
            status,
            prioridade,
            solicitante,
            responsavel,
            aberta_em,
            prazo,
            FLOOR(
              EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - prazo)) / 3600
            )::integer AS horas_atraso
          FROM ordens_servico
          WHERE prazo < CURRENT_TIMESTAMP
            AND status NOT IN ('concluida', 'cancelada')
            AND prazo >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
            AND (
              $2::text IS NULL
              OR responsavel ILIKE '%' || $2 || '%'
            )
            AND (
              $3::text IS NULL
              OR solicitante ILIKE '%' || $3 || '%'
            )
            AND (
              $4::text IS NULL
              OR prioridade = $4
            )
            AND (
              $5::text IS NULL
              OR status = $5
            )
          ORDER BY prazo, numero
          LIMIT $6
        `,
        [
          dias,
          escapeLikeOrNull(responsavel),
          escapeLikeOrNull(solicitante),
          prioridade ?? null,
          status ?? null,
          limite,
        ],
      );

      return success({
        filtros: {
          periodo_dias: dias,
          responsavel: responsavel ?? null,
          solicitante: solicitante ?? null,
          prioridade: prioridade ?? null,
          status: status ?? null,
          limite,
        },
        quantidade: result.rowCount,
        ordens_servico: result.rows,
      });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "listar_os_por_responsavel",
  {
    title: "Listar OS por responsável",
    description:
      "Lista ordens de serviço atribuídas a um responsável. Aceita o nome completo ou parte do nome e permite filtrar por status, solicitante e prioridade.",
    inputSchema: {
      responsavel: z.string().trim().min(1).max(150),
      status: z
        .enum([
          "aberta",
          "em_andamento",
          "aguardando",
          "concluida",
          "cancelada",
        ])
        .optional(),
      solicitante: z.string().trim().min(1).max(150).optional(),
      prioridade: z.enum(["baixa", "media", "alta", "critica"]).optional(),
      dias: z.number().int().min(1).max(3650).default(3650),
      limite: z.number().int().min(1).max(100).default(20),
    },
  },
  async ({ responsavel, status, solicitante, prioridade, dias, limite }) => {
    try {
      const result = await pool.query(
        `
          SELECT
            id,
            numero,
            titulo,
            status,
            prioridade,
            solicitante,
            responsavel,
            aberta_em,
            prazo,
            concluida_em,
            (
              prazo < CURRENT_TIMESTAMP
              AND status NOT IN ('concluida', 'cancelada')
            ) AS atrasada
          FROM ordens_servico
          WHERE responsavel ILIKE '%' || $1 || '%'
            AND aberta_em >= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 day')
            AND (
              $3::text IS NULL
              OR status = $3
            )
            AND (
              $4::text IS NULL
              OR solicitante ILIKE '%' || $4 || '%'
            )
            AND (
              $5::text IS NULL
              OR prioridade = $5
            )
          ORDER BY
            CASE status
              WHEN 'aberta' THEN 1
              WHEN 'em_andamento' THEN 2
              WHEN 'aguardando' THEN 3
              WHEN 'concluida' THEN 4
              WHEN 'cancelada' THEN 5
            END,
            prazo,
            numero
          LIMIT $6
        `,
        [
          escapeLikePattern(responsavel),
          dias,
          status ?? null,
          escapeLikeOrNull(solicitante),
          prioridade ?? null,
          limite,
        ],
      );

      return success({
        filtros: {
          responsavel,
          status: status ?? null,
          solicitante: solicitante ?? null,
          prioridade: prioridade ?? null,
          periodo_dias: dias,
          limite,
        },
        quantidade: result.rowCount,
        ordens_servico: result.rows,
      });
    } catch (error) {
      return failure(error);
    }
  },
);
server.registerTool(
  "listar_os_por_cliente",
  {
    title: "Listar OS por cliente",
    description:
      "Lista ordens de serviço vinculadas a um cliente cadastrado. Aceita o nome completo ou parte do nome e permite filtrar por status e prioridade.",
    inputSchema: {
      cliente: z.string().trim().min(1).max(150),
      status: z
        .enum([
          "aberta",
          "em_andamento",
          "aguardando",
          "concluida",
          "cancelada",
        ])
        .optional(),
      prioridade: z.enum(["baixa", "media", "alta", "critica"]).optional(),
      dias: z.number().int().min(1).max(3650).default(3650),
      limite: z.number().int().min(1).max(100).default(20),
    },
  },
  async ({ cliente, status, prioridade, dias, limite }) => {
    try {
      const result = await pool.query(
        `
          SELECT
            os.id,
            os.numero,
            os.titulo,
            os.status,
            os.prioridade,
            os.solicitante,
            os.responsavel,
            os.aberta_em,
            os.prazo,
            os.concluida_em,
            c.id AS cliente_id,
            c.nome AS cliente_nome,
            (
              os.prazo < CURRENT_TIMESTAMP
              AND os.status NOT IN ('concluida', 'cancelada')
            ) AS atrasada
          FROM ordens_servico os
          JOIN clientes c ON c.id = os.cliente_id
          WHERE c.nome ILIKE '%' || $1 || '%'
            AND os.aberta_em >= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 day')
            AND (
              $3::text IS NULL
              OR os.status = $3
            )
            AND (
              $4::text IS NULL
              OR os.prioridade = $4
            )
          ORDER BY
            CASE os.status
              WHEN 'aberta' THEN 1
              WHEN 'em_andamento' THEN 2
              WHEN 'aguardando' THEN 3
              WHEN 'concluida' THEN 4
              WHEN 'cancelada' THEN 5
            END,
            os.prazo,
            os.numero
          LIMIT $5
        `,
        [
          escapeLikePattern(cliente),
          dias,
          status ?? null,
          prioridade ?? null,
          limite,
        ],
      );

      return success({
        filtros: {
          cliente,
          status: status ?? null,
          prioridade: prioridade ?? null,
          periodo_dias: dias,
          limite,
        },
        quantidade: result.rowCount,
        ordens_servico: result.rows,
      });
    } catch (error) {
      return failure(error);
    }
  },
);
server.registerTool(
  "listar_os_por_solicitante",
  {
    title: "Listar OS por solicitante",
    description:
      "Lista ordens de serviço registradas por um solicitante. Aceita o nome completo ou parte do nome e permite filtrar por status, responsável e prioridade.",
    inputSchema: {
      solicitante: z.string().trim().min(1).max(150),
      status: z
        .enum([
          "aberta",
          "em_andamento",
          "aguardando",
          "concluida",
          "cancelada",
        ])
        .optional(),
      responsavel: z.string().trim().min(1).max(150).optional(),
      prioridade: z.enum(["baixa", "media", "alta", "critica"]).optional(),
      dias: z.number().int().min(1).max(3650).default(3650),
      limite: z.number().int().min(1).max(100).default(20),
    },
  },
  async ({ solicitante, status, responsavel, prioridade, dias, limite }) => {
    try {
      const result = await pool.query(
        `
          SELECT
            id,
            numero,
            titulo,
            status,
            prioridade,
            solicitante,
            responsavel,
            aberta_em,
            prazo,
            concluida_em,
            (
              prazo < CURRENT_TIMESTAMP
              AND status NOT IN ('concluida', 'cancelada')
            ) AS atrasada
          FROM ordens_servico
          WHERE solicitante ILIKE '%' || $1 || '%'
            AND aberta_em >= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 day')
            AND (
              $3::text IS NULL
              OR status = $3
            )
            AND (
              $4::text IS NULL
              OR responsavel ILIKE '%' || $4 || '%'
            )
            AND (
              $5::text IS NULL
              OR prioridade = $5
            )
          ORDER BY aberta_em DESC, numero DESC
          LIMIT $6
        `,
        [
          escapeLikePattern(solicitante),
          dias,
          status ?? null,
          escapeLikeOrNull(responsavel),
          prioridade ?? null,
          limite,
        ],
      );

      return success({
        filtros: {
          solicitante,
          status: status ?? null,
          responsavel: responsavel ?? null,
          prioridade: prioridade ?? null,
          periodo_dias: dias,
          limite,
        },
        quantidade: result.rowCount,
        ordens_servico: result.rows,
      });
    } catch (error) {
      return failure(error);
    }
  },
);
server.registerTool(
  "consultar_historico_os",
  {
    title: "Consultar histórico da OS",
    description:
      "Consulta os eventos do histórico de uma ordem de serviço pelo número exato e os apresenta em ordem cronológica.",
    inputSchema: {
      numero: z.number().int().positive().max(2147483647),
      dias: z.number().int().min(1).max(3650).default(3650),
      limite: z.number().int().min(1).max(100).default(50),
    },
  },
  async ({ numero, dias, limite }) => {
    try {
      const ordemResult = await pool.query(
        `
          SELECT
            id,
            numero,
            titulo,
            status,
            prioridade,
            solicitante,
            responsavel,
            aberta_em,
            prazo,
            concluida_em
          FROM ordens_servico
          WHERE numero = $1
        `,
        [numero],
      );

      if (ordemResult.rowCount === 0) {
        return success({
          encontrado: false,
          ordem_servico: null,
          periodo_dias: dias,
          quantidade: 0,
          historico: [],
        });
      }

      const ordemServico = ordemResult.rows[0];

      const historicoResult = await pool.query(
        `
          SELECT
            id,
            status,
            descricao,
            autor,
            registrado_em
          FROM (
            SELECT
              id,
              status,
              descricao,
              autor,
              registrado_em
            FROM historico_ordens_servico
            WHERE ordem_servico_id = $1
              AND registrado_em >=
                CURRENT_TIMESTAMP - ($2 * INTERVAL '1 day')
            ORDER BY registrado_em DESC, id DESC
            LIMIT $3
          ) AS eventos_recentes
          ORDER BY registrado_em, id
        `,
        [
          ordemServico.id,
          dias,
          limite,
        ],
      );

      return success({
        encontrado: true,
        ordem_servico: {
          numero: ordemServico.numero,
          titulo: ordemServico.titulo,
          status: ordemServico.status,
          prioridade: ordemServico.prioridade,
          solicitante: ordemServico.solicitante,
          responsavel: ordemServico.responsavel,
          aberta_em: ordemServico.aberta_em,
          prazo: ordemServico.prazo,
          concluida_em: ordemServico.concluida_em,
        },
        periodo_dias: dias,
        quantidade: historicoResult.rowCount,
        historico: historicoResult.rows,
      });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "listar_historico_os",
  {
    title: "Listar histórico de todas as OS",
    description:
      "Lista os eventos de histórico de todas as ordens de serviço, do mais recente para o mais antigo. Permite filtrar pelo status atual, pelo responsável, pelo solicitante e pela prioridade da OS.",
    inputSchema: {
      status: z
        .enum([
          "aberta",
          "em_andamento",
          "aguardando",
          "concluida",
          "cancelada",
        ])
        .optional(),
      responsavel: z.string().trim().min(1).max(150).optional(),
      solicitante: z.string().trim().min(1).max(150).optional(),
      prioridade: z.enum(["baixa", "media", "alta", "critica"]).optional(),
      dias: z.number().int().min(1).max(3650).default(3650),
      limite: z.number().int().min(1).max(100).default(20),
    },
  },
  async ({ status, responsavel, solicitante, prioridade, dias, limite }) => {
    try {
      const result = await pool.query(
        `
          SELECT
            o.numero AS os_numero,
            o.titulo AS os_titulo,
            h.status,
            h.descricao,
            h.autor,
            h.registrado_em
          FROM historico_ordens_servico h
          JOIN ordens_servico o ON o.id = h.ordem_servico_id
          WHERE h.registrado_em >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
            AND (
              $2::text IS NULL
              OR o.status = $2
            )
            AND (
              $3::text IS NULL
              OR o.responsavel ILIKE '%' || $3 || '%'
            )
            AND (
              $4::text IS NULL
              OR o.solicitante ILIKE '%' || $4 || '%'
            )
            AND (
              $5::text IS NULL
              OR o.prioridade = $5
            )
          ORDER BY h.registrado_em DESC, h.id DESC
          LIMIT $6
        `,
        [
          dias,
          status ?? null,
          escapeLikeOrNull(responsavel),
          escapeLikeOrNull(solicitante),
          prioridade ?? null,
          limite,
        ],
      );

      return success({
        periodo_dias: dias,
        status: status ?? null,
        responsavel: responsavel ?? null,
        solicitante: solicitante ?? null,
        prioridade: prioridade ?? null,
        quantidade: result.rowCount,
        eventos: result.rows,
      });
    } catch (error) {
      return failure(error);
    }
  },
);
server.registerTool(
  "resumo_os_por_status",
  {
    title: "Resumo de OS por status",
    description:
      "Agrupa as ordens de serviço por status e informa a quantidade total e a quantidade atrasada em cada grupo. Permite filtrar por responsável e solicitante.",
    inputSchema: {
      responsavel: z.string().trim().min(1).max(150).optional(),
      solicitante: z.string().trim().min(1).max(150).optional(),
      dias: z.number().int().min(1).max(3650).default(3650),
    },
  },
  async ({ responsavel, solicitante, dias }) => {
    try {
      const result = await pool.query(
        `
          SELECT
            status,
            COUNT(*)::integer AS quantidade,
            COUNT(*) FILTER (
              WHERE prazo < CURRENT_TIMESTAMP
                AND status NOT IN ('concluida', 'cancelada')
            )::integer AS atrasadas
          FROM ordens_servico
          WHERE aberta_em >=
            CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
            AND (
              $2::text IS NULL
              OR responsavel ILIKE '%' || $2 || '%'
            )
            AND (
              $3::text IS NULL
              OR solicitante ILIKE '%' || $3 || '%'
            )
          GROUP BY status
          ORDER BY
            CASE status
              WHEN 'aberta' THEN 1
              WHEN 'em_andamento' THEN 2
              WHEN 'aguardando' THEN 3
              WHEN 'concluida' THEN 4
              WHEN 'cancelada' THEN 5
            END
        `,
        [dias, escapeLikeOrNull(responsavel), escapeLikeOrNull(solicitante)],
      );

      const total = result.rows.reduce(
        (soma, item) => soma + item.quantidade,
        0,
      );

      return success({
        periodo_dias: dias,
        responsavel: responsavel ?? null,
        solicitante: solicitante ?? null,
        total,
        quantidade_status: result.rowCount,
        resumo: result.rows,
      });
    } catch (error) {
      return failure(error);
    }
  },
);
server.registerTool(
  "resumo_os_por_prioridade",
  {
    title: "Resumo de OS por prioridade",
    description:
      "Agrupa as ordens de serviço por prioridade e informa quantidades totais, pendentes, atrasadas, concluídas e canceladas. Permite filtrar por responsável e solicitante.",
    inputSchema: {
      responsavel: z.string().trim().min(1).max(150).optional(),
      solicitante: z.string().trim().min(1).max(150).optional(),
      dias: z.number().int().min(1).max(3650).default(3650),
    },
  },
  async ({ responsavel, solicitante, dias }) => {
    try {
      const result = await pool.query(
        `
          SELECT
            prioridade,
            COUNT(*)::integer AS total,
            COUNT(*) FILTER (
              WHERE status NOT IN ('concluida', 'cancelada')
            )::integer AS pendentes,
            COUNT(*) FILTER (
              WHERE prazo < CURRENT_TIMESTAMP
                AND status NOT IN ('concluida', 'cancelada')
            )::integer AS atrasadas,
            COUNT(*) FILTER (
              WHERE status = 'concluida'
            )::integer AS concluidas,
            COUNT(*) FILTER (
              WHERE status = 'cancelada'
            )::integer AS canceladas
          FROM ordens_servico
          WHERE aberta_em >=
            CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
            AND (
              $2::text IS NULL
              OR responsavel ILIKE '%' || $2 || '%'
            )
            AND (
              $3::text IS NULL
              OR solicitante ILIKE '%' || $3 || '%'
            )
          GROUP BY prioridade
          ORDER BY
            CASE prioridade
              WHEN 'critica' THEN 1
              WHEN 'alta' THEN 2
              WHEN 'media' THEN 3
              WHEN 'baixa' THEN 4
            END
        `,
        [dias, escapeLikeOrNull(responsavel), escapeLikeOrNull(solicitante)],
      );

      const total = result.rows.reduce(
        (soma, item) => soma + item.total,
        0,
      );

      return success({
        periodo_dias: dias,
        responsavel: responsavel ?? null,
        solicitante: solicitante ?? null,
        total,
        quantidade_prioridades: result.rowCount,
        resumo: result.rows,
      });
    } catch (error) {
      return failure(error);
    }
  },
);
server.registerTool(
  "listar_os_por_status",
  {
    title: "Listar OS por status",
    description:
      "Lista ordens de serviço de um status específico. Use para consultar OS abertas, em andamento, aguardando, concluídas ou canceladas. Permite filtrar também por prioridade.",
    inputSchema: {
      status: z.enum([
        "aberta",
        "em_andamento",
        "aguardando",
        "concluida",
        "cancelada",
      ]),
      prioridade: z.enum(["baixa", "media", "alta", "critica"]).optional(),
      dias: z.number().int().min(1).max(3650).default(3650),
      limite: z.number().int().min(1).max(100).default(20),
    },
  },
  async ({ status, prioridade, dias, limite }) => {
    try {
      const result = await pool.query(
        `
          SELECT
            id,
            numero,
            titulo,
            status,
            prioridade,
            solicitante,
            responsavel,
            aberta_em,
            prazo,
            concluida_em,
            (
              prazo < CURRENT_TIMESTAMP
              AND status NOT IN ('concluida', 'cancelada')
            ) AS atrasada
          FROM ordens_servico
          WHERE status = $1
            AND aberta_em >=
              CURRENT_TIMESTAMP - ($2 * INTERVAL '1 day')
            AND (
              $3::text IS NULL
              OR prioridade = $3
            )
          ORDER BY
            CASE prioridade
              WHEN 'critica' THEN 1
              WHEN 'alta' THEN 2
              WHEN 'media' THEN 3
              WHEN 'baixa' THEN 4
            END,
            prazo,
            numero
          LIMIT $4
        `,
        [
          status,
          dias,
          prioridade ?? null,
          limite,
        ],
      );

      return success({
        filtros: {
          status,
          prioridade: prioridade ?? null,
          periodo_dias: dias,
          limite,
        },
        quantidade: result.rowCount,
        ordens_servico: result.rows,
      });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "listar_os_por_prioridade",
  {
    title: "Listar OS por prioridade",
    description:
      "Lista ordens de serviço de uma prioridade específica, não importa o status. Permite filtrar também por status.",
    inputSchema: {
      prioridade: z.enum(["baixa", "media", "alta", "critica"]),
      status: z.enum([
        "aberta",
        "em_andamento",
        "aguardando",
        "concluida",
        "cancelada",
      ]).optional(),
      dias: z.number().int().min(1).max(3650).default(3650),
      limite: z.number().int().min(1).max(100).default(20),
    },
  },
  async ({ prioridade, status, dias, limite }) => {
    try {
      const result = await pool.query(
        `
          SELECT
            id,
            numero,
            titulo,
            status,
            prioridade,
            solicitante,
            responsavel,
            aberta_em,
            prazo,
            concluida_em,
            (
              prazo < CURRENT_TIMESTAMP
              AND status NOT IN ('concluida', 'cancelada')
            ) AS atrasada
          FROM ordens_servico
          WHERE prioridade = $1
            AND aberta_em >=
              CURRENT_TIMESTAMP - ($2 * INTERVAL '1 day')
            AND (
              $3::text IS NULL
              OR status = $3
            )
          ORDER BY
            CASE status
              WHEN 'aberta' THEN 1
              WHEN 'em_andamento' THEN 2
              WHEN 'aguardando' THEN 3
              WHEN 'concluida' THEN 4
              WHEN 'cancelada' THEN 5
            END,
            prazo,
            numero
          LIMIT $4
        `,
        [
          prioridade,
          dias,
          status ?? null,
          limite,
        ],
      );

      return success({
        filtros: {
          prioridade,
          status: status ?? null,
          periodo_dias: dias,
          limite,
        },
        quantidade: result.rowCount,
        ordens_servico: result.rows,
      });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "resumo_geral_os",
  {
    title: "Resumo geral de OS",
    description:
      "Retorna a contagem total de ordens de serviço, sem agrupar por status ou prioridade, incluindo quantas estão atrasadas.",
    inputSchema: {
      dias: z.number().int().min(1).max(3650).default(3650),
    },
  },
  async ({ dias }) => {
    try {
      const result = await pool.query(
        `
          SELECT
            COUNT(*)::integer AS total,
            COUNT(*) FILTER (WHERE status = 'aberta')::integer AS abertas,
            COUNT(*) FILTER (WHERE status = 'em_andamento')::integer AS em_andamento,
            COUNT(*) FILTER (WHERE status = 'aguardando')::integer AS aguardando,
            COUNT(*) FILTER (WHERE status = 'concluida')::integer AS concluidas,
            COUNT(*) FILTER (WHERE status = 'cancelada')::integer AS canceladas,
            COUNT(*) FILTER (
              WHERE prazo < CURRENT_TIMESTAMP
                AND status NOT IN ('concluida', 'cancelada')
            )::integer AS atrasadas
          FROM ordens_servico
          WHERE aberta_em >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
        `,
        [dias],
      );

      return success({ periodo_dias: dias, ...result.rows[0] });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "resumo_os_por_responsavel",
  {
    title: "Resumo de OS por responsável",
    description:
      "Agrupa as ordens de serviço por responsável e informa a quantidade total e a quantidade atrasada de cada um, ordenado do responsável com mais OS para o com menos. Útil para perguntas como 'quantas OS cada responsável tem'.",
    inputSchema: {
      dias: z.number().int().min(1).max(3650).default(3650),
      limite: z.number().int().min(1).max(100).default(20),
    },
  },
  async ({ dias, limite }) => {
    try {
      const result = await pool.query(
        `
          SELECT
            responsavel AS nome,
            COUNT(*)::integer AS total,
            COUNT(*) FILTER (
              WHERE prazo < CURRENT_TIMESTAMP
                AND status NOT IN ('concluida', 'cancelada')
            )::integer AS atrasadas
          FROM ordens_servico
          WHERE aberta_em >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
            AND responsavel IS NOT NULL
          GROUP BY responsavel
          ORDER BY total DESC, responsavel ASC
          LIMIT $2
        `,
        [dias, limite],
      );

      return success({
        periodo_dias: dias,
        quantidade_responsaveis: result.rowCount,
        resumo: result.rows,
      });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "resumo_os_por_solicitante",
  {
    title: "Resumo de OS por solicitante",
    description:
      "Agrupa as ordens de serviço por solicitante e informa a quantidade total e a quantidade atrasada de cada um, ordenado do solicitante com mais OS para o com menos. Útil para perguntas como 'quantas OS cada solicitante tem'.",
    inputSchema: {
      dias: z.number().int().min(1).max(3650).default(3650),
      limite: z.number().int().min(1).max(100).default(20),
    },
  },
  async ({ dias, limite }) => {
    try {
      const result = await pool.query(
        `
          SELECT
            solicitante AS nome,
            COUNT(*)::integer AS total,
            COUNT(*) FILTER (
              WHERE prazo < CURRENT_TIMESTAMP
                AND status NOT IN ('concluida', 'cancelada')
            )::integer AS atrasadas
          FROM ordens_servico
          WHERE aberta_em >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
            AND solicitante IS NOT NULL
          GROUP BY solicitante
          ORDER BY total DESC, solicitante ASC
          LIMIT $2
        `,
        [dias, limite],
      );

      return success({
        periodo_dias: dias,
        quantidade_solicitantes: result.rowCount,
        resumo: result.rows,
      });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "tempo_medio_resolucao_os",
  {
    title: "Tempo médio de resolução de OS",
    description:
      "Calcula o tempo médio, mínimo e máximo, em horas, entre a abertura e a conclusão das ordens de serviço já concluídas. Permite filtrar por prioridade e responsável.",
    inputSchema: {
      prioridade: z.enum(["baixa", "media", "alta", "critica"]).optional(),
      responsavel: z.string().trim().min(1).max(150).optional(),
      dias: z.number().int().min(1).max(3650).default(3650),
    },
  },
  async ({ prioridade, responsavel, dias }) => {
    try {
      const result = await pool.query(
        `
          SELECT
            COUNT(*)::integer AS quantidade_concluidas,
            ROUND(
              AVG(EXTRACT(EPOCH FROM (concluida_em - aberta_em)) / 3600)::numeric,
              1
            ) AS horas_medias,
            ROUND(
              MIN(EXTRACT(EPOCH FROM (concluida_em - aberta_em)) / 3600)::numeric,
              1
            ) AS horas_minimas,
            ROUND(
              MAX(EXTRACT(EPOCH FROM (concluida_em - aberta_em)) / 3600)::numeric,
              1
            ) AS horas_maximas
          FROM ordens_servico
          WHERE status = 'concluida'
            AND concluida_em IS NOT NULL
            AND aberta_em >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
            AND ($2::text IS NULL OR prioridade = $2)
            AND ($3::text IS NULL OR responsavel ILIKE '%' || $3 || '%')
        `,
        [dias, prioridade ?? null, escapeLikeOrNull(responsavel)],
      );

      return success({
        periodo_dias: dias,
        prioridade: prioridade ?? null,
        responsavel: responsavel ?? null,
        quantidade_concluidas: result.rows[0].quantidade_concluidas,
        horas_medias: result.rows[0].horas_medias
          ? Number(result.rows[0].horas_medias)
          : null,
        horas_minimas: result.rows[0].horas_minimas
          ? Number(result.rows[0].horas_minimas)
          : null,
        horas_maximas: result.rows[0].horas_maximas
          ? Number(result.rows[0].horas_maximas)
          : null,
      });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "status_banco",
  {
    title: "Status do PostgreSQL",
    description: "Verifica a conexão com o banco PostgreSQL isolado para testes de LLM.",
    inputSchema: {},
  },
  async () => {
    try {
      const result = await pool.query(`
        SELECT current_database() AS banco, current_user AS usuario, NOW() AS horario
      `);
      return success({ conectado: true, ...result.rows[0] });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "listar_clientes",
  {
    title: "Listar clientes",
    description: "Lista clientes cadastrados no PostgreSQL de teste.",
    inputSchema: {
      limite: z.number().int().min(1).max(100).default(20),
      somenteAtivos: z.boolean().default(true),
    },
  },
  async ({ limite, somenteAtivos }) => {
    try {
      const result = await pool.query(
        `
          SELECT id, nome, email, ativo, criado_em
          FROM clientes
          WHERE ($1::boolean = FALSE OR ativo = TRUE)
          ORDER BY id
          LIMIT $2
        `,
        [somenteAtivos, limite],
      );
      return success({ quantidade: result.rowCount, clientes: result.rows });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "buscar_cliente_por_email",
  {
    title: "Buscar cliente por e-mail",
    description: "Procura um cliente pelo e-mail exato no PostgreSQL de teste. Retorna dados cadastrais completos: documento (CPF/CNPJ), RG, telefones, endereço, gênero e profissão.",
    inputSchema: { email: z.string().trim().email() },
  },
  async ({ email }) => {
    try {
      const result = await pool.query(
        `
          SELECT
            id, nome, email, ativo, criado_em,
            documento_tipo, documento_numero, rg,
            telefone_celular, telefone_whatsapp,
            endereco_rua, endereco_numero, endereco_bairro,
            endereco_cidade, endereco_estado, endereco_cep,
            genero, profissao
          FROM clientes
          WHERE email = $1
        `,
        [email],
      );
      return success({ encontrado: result.rowCount > 0, cliente: result.rows[0] ?? null });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "buscar_cliente_por_id",
  {
    title: "Buscar cliente por ID",
    description: "Procura um cliente pelo identificador numérico. Retorna dados cadastrais completos: documento (CPF/CNPJ), RG, telefones, endereço, gênero e profissão.",
    inputSchema: { id: z.number().int().positive() },
  },
  async ({ id }) => {
    try {
      const result = await pool.query(
        `
          SELECT
            id, nome, email, ativo, criado_em,
            documento_tipo, documento_numero, rg,
            telefone_celular, telefone_whatsapp,
            endereco_rua, endereco_numero, endereco_bairro,
            endereco_cidade, endereco_estado, endereco_cep,
            genero, profissao
          FROM clientes
          WHERE id = $1
        `,
        [id],
      );
      return success({ encontrado: result.rowCount > 0, cliente: result.rows[0] ?? null });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "buscar_clientes_por_nome",
  {
    title: "Buscar clientes por nome",
    description: "Busca clientes cujo nome contenha o texto informado, sem diferenciar maiúsculas de minúsculas. Permite filtrar por status ativo/inativo e por período de cadastro. Retorna dados cadastrais completos: documento (CPF/CNPJ), RG, telefones, endereço, gênero e profissão.",
    inputSchema: {
      nome: z.string().trim().min(1).max(150),
      ativo: z.boolean().optional(),
      dias: z.number().int().min(1).max(3650).default(3650),
      limite: z.number().int().min(1).max(100).default(20),
    },
  },
  async ({ nome, ativo, dias, limite }) => {
    try {
      const result = await pool.query(
        `
          SELECT
            id, nome, email, ativo, criado_em,
            documento_tipo, documento_numero, rg,
            telefone_celular, telefone_whatsapp,
            endereco_rua, endereco_numero, endereco_bairro,
            endereco_cidade, endereco_estado, endereco_cep,
            genero, profissao
          FROM clientes
          WHERE nome ILIKE '%' || $1 || '%'
            AND (
              $2::boolean IS NULL
              OR ativo = $2
            )
            AND criado_em >= CURRENT_TIMESTAMP - ($3 * INTERVAL '1 day')
          ORDER BY nome, id
          LIMIT $4
        `,
        [escapeLikePattern(nome), ativo ?? null, dias, limite],
      );
      return success({ ativo: ativo ?? null, periodo_dias: dias, quantidade: result.rowCount, clientes: result.rows });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "listar_clientes_recentes",
  {
    title: "Listar clientes recentes",
    description: "Lista os clientes cadastrados nos últimos dias, do mais recente para o mais antigo. Permite filtrar por status ativo/inativo.",
    inputSchema: {
      ativo: z.boolean().optional(),
      dias: z.number().int().min(1).max(3650).default(30),
      limite: z.number().int().min(1).max(100).default(20),
    },
  },
  async ({ ativo, dias, limite }) => {
    try {
      const result = await pool.query(
        `
          SELECT id, nome, email, ativo, criado_em
          FROM clientes
          WHERE criado_em >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
            AND (
              $2::boolean IS NULL
              OR ativo = $2
            )
          ORDER BY criado_em DESC, id DESC
          LIMIT $3
        `,
        [dias, ativo ?? null, limite],
      );
      return success({ periodo_dias: dias, ativo: ativo ?? null, quantidade: result.rowCount, clientes: result.rows });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "listar_clientes_inativos",
  {
    title: "Listar clientes inativos",
    description: "Lista somente os clientes marcados como inativos.",
    inputSchema: { limite: z.number().int().min(1).max(100).default(20) },
  },
  async ({ limite }) => {
    try {
      const result = await pool.query(
        `
          SELECT id, nome, email, ativo, criado_em
          FROM clientes
          WHERE ativo = FALSE
          ORDER BY id
          LIMIT $1
        `,
        [limite],
      );
      return success({ quantidade: result.rowCount, clientes: result.rows });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "resumo_clientes",
  {
    title: "Resumo de clientes",
    description: "Retorna totais de clientes ativos e inativos e o período dos cadastros.",
    inputSchema: {},
  },
  async () => {
    try {
      const result = await pool.query(`
        SELECT
          COUNT(*)::integer AS total,
          COUNT(*) FILTER (WHERE ativo)::integer AS ativos,
          COUNT(*) FILTER (WHERE NOT ativo)::integer AS inativos,
          MIN(criado_em) AS primeiro_cadastro,
          MAX(criado_em) AS ultimo_cadastro
        FROM clientes
      `);
      return success(result.rows[0]);
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "listar_dominios_email",
  {
    title: "Listar domínios de e-mail",
    description: "Agrupa os clientes pelo domínio do e-mail e informa a quantidade em cada domínio.",
    inputSchema: { limite: z.number().int().min(1).max(100).default(20) },
  },
  async ({ limite }) => {
    try {
      const result = await pool.query(
        `
          SELECT LOWER(SPLIT_PART(email, '@', 2)) AS dominio, COUNT(*)::integer AS quantidade
          FROM clientes
          GROUP BY dominio
          ORDER BY quantidade DESC, dominio
          LIMIT $1
        `,
        [limite],
      );
      return success({ quantidade: result.rowCount, dominios: result.rows });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "resumo_clientes_por_mes",
  {
    title: "Resumo de clientes por mês de cadastro",
    description: "Agrupa os clientes pelo mês de cadastro e informa a quantidade total e ativa em cada mês.",
    inputSchema: { limite: z.number().int().min(1).max(100).default(24) },
  },
  async ({ limite }) => {
    try {
      const result = await pool.query(
        `
          SELECT
            TO_CHAR(DATE_TRUNC('month', criado_em), 'YYYY-MM') AS mes,
            COUNT(*)::integer AS total,
            COUNT(*) FILTER (WHERE ativo)::integer AS ativos
          FROM clientes
          GROUP BY DATE_TRUNC('month', criado_em)
          ORDER BY DATE_TRUNC('month', criado_em)
          LIMIT $1
        `,
        [limite],
      );
      return success({ quantidade_meses: result.rowCount, resumo: result.rows });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "listar_tabelas",
  {
    title: "Listar tabelas do banco",
    description: "Lista as tabelas acessíveis nos esquemas não internos do PostgreSQL.",
    inputSchema: { esquema: z.string().trim().min(1).max(63).optional() },
  },
  async ({ esquema }) => {
    try {
      const result = await pool.query(
        `
          SELECT table_schema AS esquema, table_name AS tabela, table_type AS tipo
          FROM information_schema.tables
          WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
            AND ($1::text IS NULL OR table_schema = $1)
          ORDER BY table_schema, table_name
        `,
        [esquema ?? null],
      );
      return success({ quantidade: result.rowCount, tabelas: result.rows });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "descrever_tabela",
  {
    title: "Descrever tabela",
    description: "Lista colunas, tipos, nulabilidade e valores padrão de uma tabela acessível.",
    inputSchema: {
      tabela: z.string().trim().min(1).max(63),
      esquema: z.string().trim().min(1).max(63).default("public"),
    },
  },
  async ({ tabela, esquema }) => {
    try {
      const result = await pool.query(
        `
          SELECT
            ordinal_position AS posicao,
            column_name AS coluna,
            data_type AS tipo,
            is_nullable = 'YES' AS aceita_nulo,
            column_default AS valor_padrao
          FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position
        `,
        [esquema, tabela],
      );
      return success({ esquema, tabela, quantidade: result.rowCount, colunas: result.rows });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "listar_indices",
  {
    title: "Listar índices",
    description: "Lista os índices das tabelas de um esquema PostgreSQL.",
    inputSchema: {
      esquema: z.string().trim().min(1).max(63).default("public"),
      tabela: z.string().trim().min(1).max(63).optional(),
    },
  },
  async ({ esquema, tabela }) => {
    try {
      const result = await pool.query(
        `
          SELECT schemaname AS esquema, tablename AS tabela, indexname AS indice, indexdef AS definicao
          FROM pg_indexes
          WHERE schemaname = $1 AND ($2::text IS NULL OR tablename = $2)
          ORDER BY tablename, indexname
        `,
        [esquema, tabela ?? null],
      );
      return success({ quantidade: result.rowCount, indices: result.rows });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "informacoes_banco",
  {
    title: "Informações do banco",
    description: "Exibe versão, banco, usuário, esquema atual e tamanho do PostgreSQL.",
    inputSchema: {},
  },
  async () => {
    try {
      const result = await pool.query(`
        SELECT
          VERSION() AS versao,
          current_database() AS banco,
          current_user AS usuario,
          current_schema() AS esquema_atual,
          pg_size_pretty(pg_database_size(current_database())) AS tamanho
      `);
      return success(result.rows[0]);
    } catch (error) {
      return failure(error);
    }
  },
);

async function shutdown() {
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await pool.query("SELECT 1");
} catch (error) {
  console.error("Não foi possível conectar ao PostgreSQL:", error?.code ?? error);
  await pool.end().catch(() => {});
  process.exit(1);
}

const transport = new StdioServerTransport();
await server.connect(transport);
