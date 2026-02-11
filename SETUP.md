# Cerberus Setup Guide

This document shows exactly how to run Cerberus locally and in cloud.

## 1) Prerequisites
- Node.js `20.x`
- npm
- Archestra running (local Docker or hosted)
- Access to Archestra UI for:
  - A2A/MCP Gateway token
  - Agent IDs

## 2) Clone and Install
```bash
cd "/Users/manas/Coding Workspace/Cerberus"
npm install
cp .env.example .env
```

## 3) Required Environment Variables
Edit `/Users/manas/Coding Workspace/Cerberus/.env`:

```env
ARCH_ESTRA_BASE_URL=http://localhost:9000
ARCH_ESTRA_API_KEY=<A2A_GATEWAY_TOKEN>
ARCH_ESTRA_SECURITY_AGENT_ID=<security_agent_id>
ARCH_ESTRA_PERFORMANCE_AGENT_ID=<performance_agent_id>
ARCH_ESTRA_COST_AGENT_ID=<cost_agent_id>
CERBERUS_HTTP_PORT=8080
CERBERUS_LOG_LEVEL=info
CERBERUS_API_TOKEN=

MCP_HTTP_HOST=0.0.0.0
MCP_HTTP_PORT=8090
MCP_SERVER_TOKEN=<long_random_token>
MCP_LOG_LEVEL=info

# Optional real-data mode for MCP tools
REAL_TOOLS_BEARER_TOKEN=
REAL_TOOL_TIMEOUT_MS=10000
REAL_TOOL_SAST_SCAN_URL=
REAL_TOOL_DEPENDENCY_SCAN_URL=
REAL_TOOL_CONTAINER_SCAN_URL=
REAL_TOOL_LOAD_TEST_URL=
REAL_TOOL_FETCH_METRICS_URL=
REAL_TOOL_ESTIMATE_COST_URL=
REAL_TOOL_USAGE_REPORT_URL=
```

Important:
- `ARCH_ESTRA_API_KEY` must be the Archestra gateway token that works with `POST /v1/a2a/<agent_id>`.
- `ARCH_ESTRA_*_AGENT_ID` must be three different agent IDs (`Security`, `Performance`, `Cost`).
- `MCP_SERVER_TOKEN` is separate from Archestra token.

## 4) Run Locally
Terminal 1:
```bash
npm run dev:mcp
```

Terminal 2:
```bash
npm run dev:server
```

Terminal 3 (CLI test):
```bash
npm run dev:cli -- run --sha abc123 --env staging --service-url https://example.com --config ./config/policy.yaml
```

## 5) Verify Local Endpoints
```bash
curl -sS http://localhost:8090/health
curl -sS http://localhost:8080/health
```

MCP tools list:
```bash
curl -sS -X POST "http://localhost:8090/mcp" \
  -H "content-type: application/json" \
  -H "Authorization: Bearer <MCP_SERVER_TOKEN>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

API evaluate:
```bash
curl -sS -X POST "http://localhost:8080/v1/release-gate/evaluate" \
  -H "content-type: application/json" \
  -H "Authorization: Bearer <CERBERUS_API_TOKEN_IF_SET>" \
  -d '{"sha":"stable-001","env":"staging","service_url":"https://example.com"}'
```

## 6) Archestra Integration (MCP Registry)
In Archestra UI:
1. `MCP Registry` -> `Add MCP Server`
2. Select `Remote (orchestrated not by Archestra)`
3. URL:
- Local Archestra in Docker: `http://host.docker.internal:8090/mcp`
- Cloud: `https://cerberus-release-tools.onrender.com/mcp`
4. Auth header:
- `Authorization: Bearer <MCP_SERVER_TOKEN>`
5. Install and confirm 7 tools appear.
6. Assign tools:
- `Security`: `sast_scan`, `dependency_scan`, `container_scan`
- `Performance`: `load_test`, `fetch_metrics`
- `Cost`: `estimate_cost`, `usage_report`

## 7) Render Deployment
This repo includes `/Users/manas/Coding Workspace/Cerberus/render.yaml` with two services:
- `cerberus-api`
- `cerberus-release-tools`

Steps:
1. Push code to GitHub.
2. In Render, create Blueprint from repo.
3. Set secrets in Render:
- `ARCH_ESTRA_BASE_URL`
- `ARCH_ESTRA_API_KEY`
- `ARCH_ESTRA_SECURITY_AGENT_ID`
- `ARCH_ESTRA_PERFORMANCE_AGENT_ID`
- `ARCH_ESTRA_COST_AGENT_ID`
- `MCP_SERVER_TOKEN`
4. Deploy.

## 8) Verify Deployed Services
```bash
curl -sS https://cerberus-api-sxe8.onrender.com/health
curl -sS https://cerberus-release-tools.onrender.com/health
```

MCP tools list (cloud):
```bash
curl -sS -X POST "https://cerberus-release-tools.onrender.com/mcp" \
  -H "content-type: application/json" \
  -H "Authorization: Bearer <MCP_SERVER_TOKEN>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

API evaluate (cloud):
```bash
curl -sS -X POST "https://cerberus-api-sxe8.onrender.com/v1/release-gate/evaluate" \
  -H "content-type: application/json" \
  -H "Authorization: Bearer <CERBERUS_API_TOKEN_IF_SET>" \
  -d '{"sha":"stable-001","env":"staging","service_url":"https://example.com"}'
```

## 9) Common Issues
- `integration_unavailable` on cloud API:
  - `ARCH_ESTRA_BASE_URL` is not publicly reachable from Render
  - bad/expired `ARCH_ESTRA_API_KEY`
  - wrong agent IDs
- `{"error":"unauthorized"}` on MCP:
  - missing/wrong `Authorization: Bearer <MCP_SERVER_TOKEN>`
- API evaluate endpoint returns `401`:
  - set `CERBERUS_API_TOKEN` correctly and send `Authorization: Bearer <CERBERUS_API_TOKEN>`
- `Route GET:/ not found`:
  - expected; use `/health` or API POST endpoints.
- tool outputs are synthetic:
  - configure `REAL_TOOL_*_URL` variables to connect real scanners/metrics/cost services

## 10) Security
- Rotate all keys/tokens that were ever shared in logs, screenshots, or chat.
- Never commit `.env`.
