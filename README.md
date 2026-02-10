# Cerberus

Cerberus is a multi-agent release gatekeeper for Archestra + MCP. It evaluates Security, Performance, and Cost specialist agents, then applies deterministic judge policy to return `SHIP` or `NO_SHIP`.

## Features
- Real Archestra integration for specialist agents
- Deterministic local judge with weighted policy
- CLI and HTTP API surfaces
- Standalone MCP server exposing Cerberus toolchain
- Fail-closed behavior for integration outages/timeouts
- Typed contracts and policy validation

## Requirements
- Node.js 20+

## Setup
```bash
cp .env.example .env
npm install
```

Set required environment variables:
- `ARCH_ESTRA_BASE_URL`
- `ARCH_ESTRA_API_KEY`
- `ARCH_ESTRA_SECURITY_AGENT_ID`
- `ARCH_ESTRA_PERFORMANCE_AGENT_ID`
- `ARCH_ESTRA_COST_AGENT_ID`
- `CERBERUS_HTTP_PORT` (optional, default `8080`)
- `CERBERUS_LOG_LEVEL` (optional, default `info`)
- `MCP_HTTP_HOST` (optional, default `0.0.0.0`)
- `MCP_HTTP_PORT` (optional, default `8090`)
- `MCP_SERVER_TOKEN` (optional, bearer token for MCP endpoint auth)
- `MCP_LOG_LEVEL` (optional, default `info`)

## Policy
Policy is versioned at `config/policy.yaml`.

Default decision policy:
- Hard block: any `FAIL` with non-empty `blocking`
- Weighted score: security `0.5`, performance `0.3`, cost `0.2`
- Threshold: `score < 75 => NO_SHIP`
- Fail-closed if integrations fail

## CLI
```bash
npm run dev:cli -- run --sha <git_sha> --env staging --service-url https://service.example --config ./config/policy.yaml
```

Exit codes:
- `0`: SHIP
- `2`: NO_SHIP
- `3`: runtime/integration failure (fail-closed result produced)

## HTTP API
Start server:
```bash
npm run dev:server
```

Endpoint:
- `POST /v1/release-gate/evaluate`

Request body:
```json
{
  "sha": "abc123",
  "env": "staging",
  "service_url": "https://service.example",
  "container_tag": "myimage:sha",
  "sbom_path": "./sbom.json",
  "release_config": {
    "deployment": "canary"
  }
}
```

CI curl example:
```bash
curl -sS -X POST "http://localhost:8080/v1/release-gate/evaluate" \
  -H "content-type: application/json" \
  -d '{"sha":"abc123","env":"staging","service_url":"https://service.example"}'
```

## MCP Tools Server
This repository includes a deployable MCP server named `cerberus-release-tools` with the required tools:
- `sast_scan`
- `dependency_scan`
- `container_scan`
- `load_test`
- `fetch_metrics`
- `estimate_cost`
- `usage_report`

Run locally:
```bash
npm run dev:mcp
```

Health check:
```bash
curl http://localhost:8090/health
```

MCP endpoint:
- `POST /mcp`
- Optional auth header: `Authorization: Bearer $MCP_SERVER_TOKEN`

Example `tools/list` call:
```bash
curl -sS -X POST "http://localhost:8090/mcp" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### Register in Archestra
1. Deploy this MCP server (`npm run build && npm run start:mcp` or Docker).
2. In Archestra: `MCP Registry` -> `Add MCP Server`.
3. Choose `Remote (orchestrated not by Archestra)`.
4. Set URL to your endpoint, e.g. `https://<host>/mcp`.
5. If token enabled, configure `Authorization: Bearer <MCP_SERVER_TOKEN>`.
6. Install server and verify all seven tools appear.
7. Attach tools to agents:
- `Security`: `sast_scan`, `dependency_scan`, `container_scan`
- `Performance`: `load_test`, `fetch_metrics`
- `Cost`: `estimate_cost`, `usage_report`

### Docker run
```bash
docker build -t cerberus-release-tools .
docker run --rm -p 8090:8090 -e MCP_SERVER_TOKEN=change-me cerberus-release-tools
```

## Output Contract
Final response shape:
```json
{
  "decision": "SHIP|NO_SHIP",
  "score": 0,
  "failed_gates": [],
  "next_actions": [],
  "inputs": {
    "security": "PASS|WARN|FAIL",
    "performance": "PASS|WARN|FAIL",
    "cost": "PASS|WARN|FAIL"
  },
  "trace_id": "string",
  "generated_at": "2026-02-10T00:00:00.000Z"
}
```

## Tests
```bash
npm test
```

Test coverage includes:
- Unit tests for scoring and policy parsing
- Contract tests for JSON schemas
- E2E-style tests for CLI and HTTP behavior
