# Cerberus

Cerberus is a multi-agent release gatekeeper for Archestra + MCP. It evaluates Security, Performance, and Cost specialist agents, then applies deterministic judge policy to return `SHIP` or `NO_SHIP`.

## Features
- Real Archestra integration for specialist agents
- Deterministic local judge with weighted policy
- CLI and HTTP API surfaces
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
