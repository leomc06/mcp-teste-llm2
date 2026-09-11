#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# .env é opcional aqui: localmente sempre existe (passo 2 do README); em
# container, as variáveis costumam já vir injetadas pelo orquestrador
# (docker run --env-file / docker-compose), sem o arquivo físico presente.
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
fi

exec node "$PROJECT_DIR/agent/server.js"
