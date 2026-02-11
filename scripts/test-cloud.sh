#!/usr/bin/env bash
set -euo pipefail

API_BASE="${1:-https://cerberus-api-sxe8.onrender.com}"
MCP_BASE="${2:-https://cerberus-release-tools.onrender.com}"
MCP_TOKEN="${MCP_SERVER_TOKEN:-}"
CERBERUS_TOKEN="${CERBERUS_API_TOKEN:-}"

echo "[1/4] API health (cloud)"
curl -sS "${API_BASE}/health" && echo

echo "[2/4] MCP health (cloud)"
curl -sS "${MCP_BASE}/health" && echo

echo "[3/4] MCP tools/list (cloud)"
MCP_AUTH=()
if [ -n "${MCP_TOKEN}" ]; then
  MCP_AUTH=(-H "Authorization: Bearer ${MCP_TOKEN}")
fi
curl -sS -X POST "${MCP_BASE}/mcp" \
  -H "content-type: application/json" \
  "${MCP_AUTH[@]}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' && echo

echo "[4/4] Cerberus decision (cloud)"
API_AUTH=()
if [ -n "${CERBERUS_TOKEN}" ]; then
  API_AUTH=(-H "Authorization: Bearer ${CERBERUS_TOKEN}")
fi
curl -sS -X POST "${API_BASE}/v1/release-gate/evaluate" \
  -H "content-type: application/json" \
  "${API_AUTH[@]}" \
  -d '{"sha":"stable-001","env":"staging","service_url":"https://example.com"}' && echo
