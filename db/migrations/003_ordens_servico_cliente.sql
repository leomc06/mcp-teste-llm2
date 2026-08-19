BEGIN;

ALTER TABLE ordens_servico
    ADD COLUMN IF NOT EXISTS cliente_id BIGINT REFERENCES clientes (id);

CREATE INDEX IF NOT EXISTS ordens_servico_cliente_id_idx
    ON ordens_servico (cliente_id);

-- Backfill best-effort: casa ordens de serviço existentes com clientes de mesmo nome.
UPDATE ordens_servico os
SET cliente_id = c.id
FROM clientes c
WHERE os.cliente_id IS NULL
  AND lower(c.nome) = lower(os.solicitante);

COMMIT;
