# Cerberus

Cerberus is a multi-agent release gatekeeper for Archestra + MCP.
It evaluates three specialist agents (`Security`, `Performance`, `Cost`) and returns a final `SHIP` or `NO_SHIP` decision.

## Live Endpoints
- API health: `https://cerberus-api-sxe8.onrender.com/health`
- API decision endpoint: `https://cerberus-api-sxe8.onrender.com/v1/release-gate/evaluate`
- MCP health: `https://cerberus-release-tools.onrender.com/health`
- MCP endpoint: `https://cerberus-release-tools.onrender.com/mcp`

## Quick Verify (Judges)
1. API health
```bash
curl -sS https://cerberus-api-sxe8.onrender.com/health
```
2. MCP health
```bash
curl -sS https://cerberus-release-tools.onrender.com/health
```
3. MCP tools list (token-protected)
```bash
curl -sS -X POST "https://cerberus-release-tools.onrender.com/mcp" \
  -H "content-type: application/json" \
  -H "Authorization: Bearer <MCP_SERVER_TOKEN>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```
4. Decision endpoint
```bash
curl -sS -X POST "https://cerberus-api-sxe8.onrender.com/v1/release-gate/evaluate" \
  -H "content-type: application/json" \
  -d '{"sha":"stable-001","env":"staging","service_url":"https://example.com"}'
```

## Features
- Archestra integration via A2A/agent invocation
- Deterministic judge policy with weighted scoring
- CLI and HTTP API
- Deployable MCP tools server exposing required 7 tools
- Fail-closed behavior on integration outages
- Strong typing + schema validation + automated tests

## Required Tools Exposed by MCP Server
- `sast_scan`
- `dependency_scan`
- `container_scan`
- `load_test`
- `fetch_metrics`
- `estimate_cost`
- `usage_report`

## Output Contract
```json
{
  "decision": "SHIP|NO_SHIP",
  "score": 0,
  "failed_gates": ["string"],
  "next_actions": ["string"],
  "inputs": {
    "security": "PASS|WARN|FAIL",
    "performance": "PASS|WARN|FAIL",
    "cost": "PASS|WARN|FAIL"
  },
  "trace_id": "string",
  "generated_at": "ISO-8601"
}
```

## Local Run
```bash
cp .env.example .env
npm install
npm run dev:mcp      # terminal 1
npm run dev:server   # terminal 2
```

CLI run:
```bash
npm run dev:cli -- run --sha abc123 --env staging --service-url https://example.com --config ./config/policy.yaml
```

## Deploy
Render blueprint is included at `/Users/manas/Coding Workspace/Cerberus/render.yaml`.

## Full Setup Guide
Use `/Users/manas/Coding Workspace/Cerberus/SETUP.md` for complete local, Archestra, and cloud deployment steps.
