BEGIN;

CREATE TABLE IF NOT EXISTS ordens_servico (
    id BIGSERIAL PRIMARY KEY,
    numero INTEGER NOT NULL UNIQUE,
    titulo VARCHAR(200) NOT NULL,
    descricao TEXT NOT NULL,
    status VARCHAR(30) NOT NULL,
    prioridade VARCHAR(20) NOT NULL,
    solicitante VARCHAR(150) NOT NULL,
    responsavel VARCHAR(150),
    aberta_em TIMESTAMPTZ NOT NULL,
    prazo TIMESTAMPTZ NOT NULL,
    concluida_em TIMESTAMPTZ,

    CONSTRAINT ordens_servico_numero_positivo
        CHECK (numero > 0),

    CONSTRAINT ordens_servico_status_valido
        CHECK (
            status IN (
                'aberta',
                'em_andamento',
                'aguardando',
                'concluida',
                'cancelada'
            )
        ),

    CONSTRAINT ordens_servico_prioridade_valida
        CHECK (
            prioridade IN (
                'baixa',
                'media',
                'alta',
                'critica'
            )
        ),

    CONSTRAINT ordens_servico_prazo_valido
        CHECK (prazo >= aberta_em),

    CONSTRAINT ordens_servico_conclusao_consistente
        CHECK (
            (
                status = 'concluida'
                AND concluida_em IS NOT NULL
            )
            OR
            (
                status <> 'concluida'
                AND concluida_em IS NULL
            )
        )
);

CREATE TABLE IF NOT EXISTS historico_ordens_servico (
    id BIGSERIAL PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL UNIQUE,
    ordem_servico_id BIGINT NOT NULL,
    status VARCHAR(30) NOT NULL,
    descricao TEXT NOT NULL,
    autor VARCHAR(150) NOT NULL,
    registrado_em TIMESTAMPTZ NOT NULL,

    CONSTRAINT historico_ordem_servico_fk
        FOREIGN KEY (ordem_servico_id)
        REFERENCES ordens_servico (id)
        ON DELETE RESTRICT,

    CONSTRAINT historico_status_valido
        CHECK (
            status IN (
                'aberta',
                'em_andamento',
                'aguardando',
                'concluida',
                'cancelada'
            )
        )
);

CREATE INDEX IF NOT EXISTS ordens_servico_status_prazo_idx
    ON ordens_servico (status, prazo);

CREATE INDEX IF NOT EXISTS ordens_servico_prioridade_idx
    ON ordens_servico (prioridade);

CREATE INDEX IF NOT EXISTS ordens_servico_responsavel_idx
    ON ordens_servico (LOWER(responsavel));

CREATE INDEX IF NOT EXISTS ordens_servico_solicitante_idx
    ON ordens_servico (LOWER(solicitante));

CREATE INDEX IF NOT EXISTS historico_ordem_data_idx
    ON historico_ordens_servico (ordem_servico_id, registrado_em);

INSERT INTO ordens_servico (
    numero,
    titulo,
    descricao,
    status,
    prioridade,
    solicitante,
    responsavel,
    aberta_em,
    prazo,
    concluida_em
)
VALUES
    (
        1001,
        'Impressora do financeiro indisponível',
        'A impressora do setor financeiro não está respondendo na rede.',
        'aberta',
        'media',
        'Mariana Lopes',
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '4 days',
        CURRENT_TIMESTAMP - INTERVAL '2 days',
        NULL
    ),
    (
        1002,
        'Falha de acesso ao sistema de estoque',
        'O usuário recebe uma mensagem de acesso negado ao abrir o sistema.',
        'em_andamento',
        'alta',
        'Rafael Martins',
        'Carlos Souza',
        CURRENT_TIMESTAMP - INTERVAL '4 days',
        CURRENT_TIMESTAMP + INTERVAL '2 days',
        NULL
    ),
    (
        1003,
        'Servidor de arquivos com pouco espaço',
        'O volume principal do servidor atingiu o limite de utilização.',
        'concluida',
        'critica',
        'Fernanda Lima',
        'Ana Costa',
        CURRENT_TIMESTAMP - INTERVAL '6 days',
        CURRENT_TIMESTAMP - INTERVAL '2 days',
        CURRENT_TIMESTAMP - INTERVAL '3 days'
    ),
    (
        1004,
        'Solicitação duplicada de acesso',
        'A solicitação foi registrada duas vezes pelo mesmo usuário.',
        'cancelada',
        'baixa',
        'João Mendes',
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '3 days',
        CURRENT_TIMESTAMP - INTERVAL '1 day',
        NULL
    ),
    (
        1005,
        'Indisponibilidade do sistema de faturamento',
        'O sistema de faturamento apresenta erro ao emitir documentos.',
        'aberta',
        'critica',
        'Patrícia Gomes',
        'Carlos Souza',
        CURRENT_TIMESTAMP - INTERVAL '2 days',
        CURRENT_TIMESTAMP - INTERVAL '6 hours',
        NULL
    ),
    (
        1006,
        'Troca de equipamento aguardando aprovação',
        'A substituição do equipamento depende da aprovação do gestor.',
        'aguardando',
        'media',
        'Lucas Rocha',
        'Ana Costa',
        CURRENT_TIMESTAMP - INTERVAL '1 day',
        CURRENT_TIMESTAMP + INTERVAL '5 days',
        NULL
    ),
    (
        1007,
        'Atualização do antivírus pendente',
        'Algumas estações não receberam a atualização mais recente.',
        'em_andamento',
        'baixa',
        'Camila Ribeiro',
        'Beatriz Alves',
        CURRENT_TIMESTAMP - INTERVAL '5 days',
        CURRENT_TIMESTAMP - INTERVAL '1 day',
        NULL
    ),
    (
        1008,
        'Configuração de acesso à rede sem fio',
        'Novo colaborador precisa de acesso à rede corporativa de testes.',
        'aberta',
        'alta',
        'Eduardo Nunes',
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '6 hours',
        CURRENT_TIMESTAMP + INTERVAL '7 days',
        NULL
    )
ON CONFLICT (numero) DO NOTHING;

INSERT INTO historico_ordens_servico (
    codigo,
    ordem_servico_id,
    status,
    descricao,
    autor,
    registrado_em
)
SELECT
    'OS1001-01',
    id,
    'aberta',
    'Ordem de serviço registrada e aguardando atribuição.',
    'Mariana Lopes',
    aberta_em
FROM ordens_servico
WHERE numero = 1001
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO historico_ordens_servico (
    codigo,
    ordem_servico_id,
    status,
    descricao,
    autor,
    registrado_em
)
SELECT
    'OS1002-01',
    id,
    'aberta',
    'Ordem de serviço registrada.',
    'Rafael Martins',
    aberta_em
FROM ordens_servico
WHERE numero = 1002
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO historico_ordens_servico (
    codigo,
    ordem_servico_id,
    status,
    descricao,
    autor,
    registrado_em
)
SELECT
    'OS1002-02',
    id,
    'em_andamento',
    'Atendimento iniciado e atribuído ao responsável.',
    'Carlos Souza',
    aberta_em + INTERVAL '1 day'
FROM ordens_servico
WHERE numero = 1002
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO historico_ordens_servico (
    codigo,
    ordem_servico_id,
    status,
    descricao,
    autor,
    registrado_em
)
SELECT
    'OS1003-01',
    id,
    'aberta',
    'Alerta de espaço em disco registrado.',
    'Fernanda Lima',
    aberta_em
FROM ordens_servico
WHERE numero = 1003
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO historico_ordens_servico (
    codigo,
    ordem_servico_id,
    status,
    descricao,
    autor,
    registrado_em
)
SELECT
    'OS1003-02',
    id,
    'em_andamento',
    'Limpeza de arquivos temporários iniciada.',
    'Ana Costa',
    aberta_em + INTERVAL '1 day'
FROM ordens_servico
WHERE numero = 1003
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO historico_ordens_servico (
    codigo,
    ordem_servico_id,
    status,
    descricao,
    autor,
    registrado_em
)
SELECT
    'OS1003-03',
    id,
    'concluida',
    'Espaço liberado e monitoramento normalizado.',
    'Ana Costa',
    concluida_em
FROM ordens_servico
WHERE numero = 1003
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO historico_ordens_servico (
    codigo,
    ordem_servico_id,
    status,
    descricao,
    autor,
    registrado_em
)
SELECT
    'OS1004-01',
    id,
    'aberta',
    'Solicitação registrada.',
    'João Mendes',
    aberta_em
FROM ordens_servico
WHERE numero = 1004
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO historico_ordens_servico (
    codigo,
    ordem_servico_id,
    status,
    descricao,
    autor,
    registrado_em
)
SELECT
    'OS1004-02',
    id,
    'cancelada',
    'Solicitação cancelada por duplicidade.',
    'Equipe de suporte',
    aberta_em + INTERVAL '2 hours'
FROM ordens_servico
WHERE numero = 1004
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO historico_ordens_servico (
    codigo,
    ordem_servico_id,
    status,
    descricao,
    autor,
    registrado_em
)
SELECT
    'OS1005-01',
    id,
    'aberta',
    'Incidente crítico registrado e encaminhado.',
    'Patrícia Gomes',
    aberta_em
FROM ordens_servico
WHERE numero = 1005
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO historico_ordens_servico (
    codigo,
    ordem_servico_id,
    status,
    descricao,
    autor,
    registrado_em
)
SELECT
    'OS1006-01',
    id,
    'aberta',
    'Solicitação de troca de equipamento registrada.',
    'Lucas Rocha',
    aberta_em
FROM ordens_servico
WHERE numero = 1006
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO historico_ordens_servico (
    codigo,
    ordem_servico_id,
    status,
    descricao,
    autor,
    registrado_em
)
SELECT
    'OS1006-02',
    id,
    'aguardando',
    'Atendimento aguardando aprovação do gestor.',
    'Ana Costa',
    aberta_em + INTERVAL '4 hours'
FROM ordens_servico
WHERE numero = 1006
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO historico_ordens_servico (
    codigo,
    ordem_servico_id,
    status,
    descricao,
    autor,
    registrado_em
)
SELECT
    'OS1007-01',
    id,
    'em_andamento',
    'Atualização iniciada nas estações afetadas.',
    'Beatriz Alves',
    aberta_em
FROM ordens_servico
WHERE numero = 1007
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO historico_ordens_servico (
    codigo,
    ordem_servico_id,
    status,
    descricao,
    autor,
    registrado_em
)
SELECT
    'OS1008-01',
    id,
    'aberta',
    'Solicitação de acesso à rede registrada.',
    'Eduardo Nunes',
    aberta_em
FROM ordens_servico
WHERE numero = 1008
ON CONFLICT (codigo) DO NOTHING;

GRANT SELECT ON TABLE ordens_servico TO mcp_reader;
GRANT SELECT ON TABLE historico_ordens_servico TO mcp_reader;
GRANT SELECT ON SEQUENCE ordens_servico_id_seq TO mcp_reader;
GRANT SELECT ON SEQUENCE historico_ordens_servico_id_seq TO mcp_reader;

COMMIT;
