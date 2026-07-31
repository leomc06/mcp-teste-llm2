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
      limite: z.number().int().min(1).max(50).default(20),
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
              OR LOWER(responsavel) = LOWER($1)
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
          responsavel ?? null,
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
  "listar_os_atrasadas",
  {
    title: "Listar OS atrasadas",
    description:
      "Lista ordens de serviço com prazo vencido que ainda não foram concluídas nem canceladas. Permite filtrar por responsável e prioridade.",
    inputSchema: {
      responsavel: z.string().trim().min(1).max(150).optional(),
      prioridade: z.enum(["baixa", "media", "alta", "critica"]).optional(),
      dias: z.number().int().min(1).max(3650).default(365),
      limite: z.number().int().min(1).max(50).default(20),
    },
  },
  async ({ responsavel, prioridade, dias, limite }) => {
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
              OR LOWER(responsavel) = LOWER($2)
            )
            AND (
              $3::text IS NULL
              OR prioridade = $3
            )
          ORDER BY prazo, numero
          LIMIT $4
        `,
        [
          dias,
          responsavel ?? null,
          prioridade ?? null,
          limite,
        ],
      );

      return success({
        filtros: {
          periodo_dias: dias,
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
  "listar_os_por_responsavel",
  {
    title: "Listar OS por responsável",
    description:
      "Lista ordens de serviço atribuídas a um responsável. Aceita o nome completo ou parte do nome e permite filtrar por status.",
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
      dias: z.number().int().min(1).max(3650).default(365),
      limite: z.number().int().min(1).max(50).default(20),
    },
  },
  async ({ responsavel, status, dias, limite }) => {
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
          responsavel,
          dias,
          status ?? null,
          limite,
        ],
      );

      return success({
        filtros: {
          responsavel,
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
  "listar_os_por_solicitante",
  {
    title: "Listar OS por solicitante",
    description:
      "Lista ordens de serviço registradas por um solicitante. Aceita o nome completo ou parte do nome e permite filtrar por status.",
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
      dias: z.number().int().min(1).max(3650).default(365),
      limite: z.number().int().min(1).max(50).default(20),
    },
  },
  async ({ solicitante, status, dias, limite }) => {
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
          ORDER BY aberta_em DESC, numero DESC
          LIMIT $4
        `,
        [
          solicitante,
          dias,
          status ?? null,
          limite,
        ],
      );

      return success({
        filtros: {
          solicitante,
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
  "resumo_os_por_status",
  {
    title: "Resumo de OS por status",
    description:
      "Agrupa as ordens de serviço por status e informa a quantidade total e a quantidade atrasada em cada grupo.",
    inputSchema: {
      dias: z.number().int().min(1).max(3650).default(365),
    },
  },
  async ({ dias }) => {
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
        [dias],
      );

      const total = result.rows.reduce(
        (soma, item) => soma + item.quantidade,
        0,
      );

      return success({
        periodo_dias: dias,
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
      "Agrupa as ordens de serviço por prioridade e informa quantidades totais, pendentes, atrasadas, concluídas e canceladas.",
    inputSchema: {
      dias: z.number().int().min(1).max(3650).default(365),
    },
  },
  async ({ dias }) => {
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
          GROUP BY prioridade
          ORDER BY
            CASE prioridade
              WHEN 'critica' THEN 1
              WHEN 'alta' THEN 2
              WHEN 'media' THEN 3
              WHEN 'baixa' THEN 4
            END
        `,
        [dias],
      );

      const total = result.rows.reduce(
        (soma, item) => soma + item.total,
        0,
      );

      return success({
        periodo_dias: dias,
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
      "Lista ordens de serviço de um status específico. Use para consultar OS abertas, em andamento, aguardando, concluídas ou canceladas.",
    inputSchema: {
      status: z.enum([
        "aberta",
        "em_andamento",
        "aguardando",
        "concluida",
        "cancelada",
      ]),
      dias: z.number().int().min(1).max(3650).default(365),
      limite: z.number().int().min(1).max(50).default(20),
    },
  },
  async ({ status, dias, limite }) => {
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
          status,
          dias,
          limite,
        ],
      );

      return success({
        filtros: {
          status,
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
    description: "Procura um cliente pelo e-mail exato no PostgreSQL de teste.",
    inputSchema: { email: z.string().email() },
  },
  async ({ email }) => {
    try {
      const result = await pool.query(
        `SELECT id, nome, email, ativo, criado_em FROM clientes WHERE email = $1`,
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
    description: "Procura um cliente pelo identificador numérico.",
    inputSchema: { id: z.number().int().positive() },
  },
  async ({ id }) => {
    try {
      const result = await pool.query(
        `SELECT id, nome, email, ativo, criado_em FROM clientes WHERE id = $1`,
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
    description: "Busca clientes cujo nome contenha o texto informado, sem diferenciar maiúsculas de minúsculas.",
    inputSchema: {
      nome: z.string().trim().min(1).max(150),
      limite: z.number().int().min(1).max(100).default(20),
    },
  },
  async ({ nome, limite }) => {
    try {
      const result = await pool.query(
        `
          SELECT id, nome, email, ativo, criado_em
          FROM clientes
          WHERE nome ILIKE '%' || $1 || '%'
          ORDER BY nome, id
          LIMIT $2
        `,
        [nome, limite],
      );
      return success({ quantidade: result.rowCount, clientes: result.rows });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "listar_clientes_recentes",
  {
    title: "Listar clientes recentes",
    description: "Lista os clientes cadastrados nos últimos dias, do mais recente para o mais antigo.",
    inputSchema: {
      dias: z.number().int().min(1).max(3650).default(30),
      limite: z.number().int().min(1).max(100).default(20),
    },
  },
  async ({ dias, limite }) => {
    try {
      const result = await pool.query(
        `
          SELECT id, nome, email, ativo, criado_em
          FROM clientes
          WHERE criado_em >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
          ORDER BY criado_em DESC, id DESC
          LIMIT $2
        `,
        [dias, limite],
      );
      return success({ periodo_dias: dias, quantidade: result.rowCount, clientes: result.rows });
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
