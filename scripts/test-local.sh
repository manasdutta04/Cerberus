#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "[1/4] API health (local)"
curl -sS "http://localhost:${CERBERUS_HTTP_PORT:-8080}/health" && echo

echo "[2/4] MCP health (local)"
curl -sS "http://localhost:${MCP_HTTP_PORT:-8090}/health" && echo

echo "[3/4] MCP tools/list (local)"
AUTH_HEADER=()
if [ -n "${MCP_SERVER_TOKEN:-}" ]; then
  AUTH_HEADER=(-H "Authorization: Bearer ${MCP_SERVER_TOKEN}")
fi
curl -sS -X POST "http://localhost:${MCP_HTTP_PORT:-8090}/mcp" \
  -H "content-type: application/json" \
  "${AUTH_HEADER[@]}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' && echo

echo "[4/4] Cerberus decision (local CLI)"
npm run dev:cli -- run --sha "${1:-stable-001}" --env "${2:-staging}" --service-url "${3:-https://example.com}" --config ./config/policy.yaml
