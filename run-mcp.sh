#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# .env é opcional aqui: localmente sempre existe (passo 2 do README); quando
# este script é spawnado como processo filho por agent/server.js, ele já
# herda o ambiente do processo pai (que em container recebe as variáveis do
# orquestrador), então o source só é necessário se o arquivo existir.
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
fi

exec node "$PROJECT_DIR/src/server.js"
