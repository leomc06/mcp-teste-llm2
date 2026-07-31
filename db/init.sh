#!/usr/bin/env bash
set -euo pipefail

psql \
  -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=postgres_db="$POSTGRES_DB" \
  --set=mcp_reader_password="$MCP_READER_PASSWORD" <<'EOSQL'

CREATE TABLE clientes (
    id BIGSERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO clientes (nome, email, ativo)
VALUES
    ('Ana Silva', 'ana@example.com', TRUE),
    ('Bruno Santos', 'bruno@example.com', TRUE),
    ('Carla Oliveira', 'carla@example.com', FALSE);

CREATE ROLE mcp_reader
    LOGIN
    PASSWORD :'mcp_reader_password'
    CONNECTION LIMIT 5;

REVOKE ALL ON SCHEMA public FROM PUBLIC;

GRANT CONNECT ON DATABASE :"postgres_db" TO mcp_reader;
GRANT USAGE ON SCHEMA public TO mcp_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mcp_reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO mcp_reader;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT ON TABLES TO mcp_reader;

ALTER ROLE mcp_reader SET default_transaction_read_only = ON;
ALTER ROLE mcp_reader SET statement_timeout = '5s';

\ir /docker-entrypoint-initdb.d/migrations/001_ordens_servico.sql

EOSQL
