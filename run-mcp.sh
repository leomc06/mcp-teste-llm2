#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

set -a
source "$PROJECT_DIR/.env"
set +a

exec node "$PROJECT_DIR/src/server.js"
