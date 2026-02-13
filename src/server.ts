import Fastify from "fastify";
import { pathToFileURL } from "node:url";
import { createDependencies } from "./index.js";
import { evaluateRelease } from "./judge/evaluateRelease.js";
import { EvaluateRequestSchema } from "./types/contracts.js";

const uiHtml = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cerberus Release Gate</title>
  <style>
    :root {
      --bg: #0a1118;
      --card: #101a24;
      --line: #233345;
      --ink: #d8e7f5;
      --muted: #8ba5bf;
      --ok: #21c983;
      --warn: #f5b545;
      --fail: #ef536c;
      --accent: #3ecbff;
      --accent-2: #5c9bff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      background:
        radial-gradient(900px 500px at -10% -20%, rgba(62, 203, 255, 0.20), transparent 60%),
        radial-gradient(900px 500px at 110% 120%, rgba(92, 155, 255, 0.22), transparent 58%),
        var(--bg);
      font-family: "Space Grotesk", "Avenir Next", "Segoe UI", sans-serif;
      padding: 24px;
    }
    .shell {
      width: min(1020px, 100%);
      margin: 0 auto;
    }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 18px;
    }
    .brand {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }
    .badge {
      border: 1px solid var(--line);
      color: var(--muted);
      font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace;
      font-size: 12px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(16, 26, 36, 0.75);
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    .card {
      background: linear-gradient(180deg, rgba(16, 26, 36, 0.88), rgba(16, 26, 36, 0.80));
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 18px;
      box-shadow: 0 22px 40px rgba(0, 0, 0, 0.22);
      backdrop-filter: blur(4px);
    }
    .card h2 {
      margin: 0 0 14px;
      font-size: 16px;
      color: #ecf6ff;
    }
    .field { margin-bottom: 12px; }
    .field label {
      display: block;
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 6px;
      letter-spacing: 0.2px;
    }
    .field input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #0d151f;
      color: var(--ink);
      outline: none;
    }
    .field input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(62, 203, 255, 0.15);
    }
    .actions {
      margin-top: 14px;
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    button {
      border: none;
      border-radius: 10px;
      padding: 11px 14px;
      cursor: pointer;
      font-weight: 700;
      letter-spacing: 0.2px;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      color: #07131d;
    }
    .ghost {
      background: transparent;
      border: 1px solid var(--line);
      color: var(--ink);
    }
    button[disabled] { opacity: 0.65; cursor: not-allowed; }
    .hint {
      color: var(--muted);
      font-size: 12px;
      font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace;
    }
    .result-top {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      margin-bottom: 10px;
    }
    .pill {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 700;
    }
    .pass { color: var(--ok); border-color: rgba(33, 201, 131, 0.35); }
    .warn { color: var(--warn); border-color: rgba(245, 181, 69, 0.35); }
    .fail { color: var(--fail); border-color: rgba(239, 83, 108, 0.35); }
    .summary {
      margin-bottom: 10px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .summary h3 {
      margin: 0 0 6px;
      font-size: 12px;
      color: var(--muted);
      letter-spacing: 0.2px;
      font-weight: 600;
    }
    .list {
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #0d151f;
      min-height: 64px;
      padding: 8px;
      font-size: 12px;
      color: #c6d7e8;
    }
    .row {
      border-bottom: 1px dashed rgba(139, 165, 191, 0.2);
      padding: 6px 2px;
    }
    .row:last-child {
      border-bottom: none;
    }
    pre {
      margin: 0;
      min-height: 360px;
      overflow: auto;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: #0b121a;
      padding: 12px;
      color: #bee0ff;
      font-size: 12px;
      line-height: 1.5;
      font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace;
    }
    .error {
      margin-top: 10px;
      color: #ff9aab;
      font-size: 13px;
    }
    @media (max-width: 880px) {
      body { padding: 14px; }
      .grid { grid-template-columns: 1fr; }
      pre { min-height: 220px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="topbar">
      <div class="brand">Cerberus</div>
      <div class="badge">Developed by Manas with Archestra</div>
    </div>
    <div class="grid">
      <section class="card">
        <h2>Evaluate Release</h2>
        <div class="field">
          <label for="sha">Commit SHA</label>
          <input id="sha" value="stable-001" />
        </div>
        <div class="field">
          <label for="env">Environment</label>
          <input id="env" value="staging" />
        </div>
        <div class="field">
          <label for="service_url">Service URL</label>
          <input id="service_url" value="https://example.com" />
        </div>
        <div class="field">
          <label for="token">API Token (optional)</label>
          <input id="token" type="password" placeholder="CERBERUS_API_TOKEN if enabled" />
        </div>
        <div class="actions">
          <button class="ghost" id="presetShip">Present: 1</button>
          <button class="ghost" id="presetNoShip">Present: 2</button>
        </div>
        <div class="actions">
          <button id="runBtn">Run Gate Check</button>
          <button class="ghost" id="copyBtn">Copy JSON</button>
          <span class="hint" id="meta">Ready</span>
        </div>
        <div class="error" id="err"></div>
      </section>

      <section class="card">
        <h2>Decision Output</h2>
        <div class="result-top" id="pills"></div>
        <div class="summary">
          <div>
            <h3>Failed Gates</h3>
            <div class="list" id="failedList">No data yet</div>
          </div>
          <div>
            <h3>Next Actions</h3>
            <div class="list" id="actionList">No data yet</div>
          </div>
        </div>
        <pre id="out">Click "Run Gate Check" to evaluate.</pre>
      </section>
    </div>
  </div>

  <script>
    const runBtn = document.getElementById("runBtn");
    const out = document.getElementById("out");
    const err = document.getElementById("err");
    const pills = document.getElementById("pills");
    const meta = document.getElementById("meta");
    const failedList = document.getElementById("failedList");
    const actionList = document.getElementById("actionList");
    const presetShip = document.getElementById("presetShip");
    const presetNoShip = document.getElementById("presetNoShip");
    const copyBtn = document.getElementById("copyBtn");

    function addPill(text, kind) {
      const el = document.createElement("span");
      el.className = "pill " + kind;
      el.textContent = text;
      pills.appendChild(el);
    }

    function renderList(node, items) {
      if (!Array.isArray(items) || items.length === 0) {
        node.textContent = "None";
        return;
      }
      node.innerHTML = "";
      items.forEach(function(item) {
        const row = document.createElement("div");
        row.className = "row";
        row.textContent = String(item);
        node.appendChild(row);
      });
    }

    function applyPreset(mode) {
      document.getElementById("env").value = "staging";
      if (mode === "ship") {
        document.getElementById("sha").value = "stable-clean-ship";
        document.getElementById("service_url").value = "https://example.com";
      } else {
        document.getElementById("sha").value = "risky-release-001";
        document.getElementById("service_url").value = "https://staging-failure.invalid";
      }
      err.textContent = "";
      meta.textContent = "Preset loaded";
    }

    async function run() {
      err.textContent = "";
      pills.innerHTML = "";
      failedList.textContent = "Running...";
      actionList.textContent = "Running...";
      runBtn.disabled = true;
      meta.textContent = "Running...";
      const started = Date.now();

      const payload = {
        sha: document.getElementById("sha").value,
        env: document.getElementById("env").value,
        service_url: document.getElementById("service_url").value
      };
      const token = document.getElementById("token").value;

      try {
        const res = await fetch("/v1/release-gate/evaluate", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(token ? { Authorization: "Bearer " + token } : {})
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        out.textContent = JSON.stringify(data, null, 2);

        if (!res.ok) {
          err.textContent = "Request failed with status " + res.status;
        }

        if (data.decision) {
          addPill("Decision: " + data.decision, data.decision === "SHIP" ? "pass" : "fail");
        }
        if (typeof data.score === "number") {
          const kind = data.score >= 75 ? "pass" : data.score >= 60 ? "warn" : "fail";
          addPill("Score: " + data.score, kind);
        }
        if (data.inputs) {
          addPill("Sec " + data.inputs.security, data.inputs.security === "PASS" ? "pass" : data.inputs.security === "WARN" ? "warn" : "fail");
          addPill("Perf " + data.inputs.performance, data.inputs.performance === "PASS" ? "pass" : data.inputs.performance === "WARN" ? "warn" : "fail");
          addPill("Cost " + data.inputs.cost, data.inputs.cost === "PASS" ? "pass" : data.inputs.cost === "WARN" ? "warn" : "fail");
        }
        renderList(failedList, data.failed_gates);
        renderList(actionList, data.next_actions);
      } catch (e) {
        err.textContent = String(e);
        failedList.textContent = "Failed to load";
        actionList.textContent = "Failed to load";
      } finally {
        runBtn.disabled = false;
        meta.textContent = "Done in " + (Date.now() - started) + "ms";
      }
    }

    presetShip.addEventListener("click", function() { applyPreset("ship"); });
    presetNoShip.addEventListener("click", function() { applyPreset("no-ship"); });
    copyBtn.addEventListener("click", async function() {
      try {
        await navigator.clipboard.writeText(out.textContent || "");
        meta.textContent = "JSON copied";
      } catch (e) {
        err.textContent = "Copy failed: " + String(e);
      }
    });
    runBtn.addEventListener("click", run);
  </script>
</body>
</html>`;

export function buildServer(policyPath = "./config/policy.yaml") {
  const deps = createDependencies(policyPath);
  const app = Fastify({ logger: false });

  app.get("/", async (_request, reply) => reply.type("text/html").send(uiHtml));
  app.get("/health", async () => ({ ok: true, service: "cerberus-api" }));

  app.post("/v1/release-gate/evaluate", async (request, reply) => {
    if (deps.config.apiToken) {
      const auth = request.headers.authorization;
      if (auth !== `Bearer ${deps.config.apiToken}`) {
        return reply.status(401).send({ error: "unauthorized" });
      }
    }

    const parse = EvaluateRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: "invalid_request",
        details: parse.error.issues.map((issue) => issue.message)
      });
    }

    const result = await evaluateRelease(parse.data, {
      policy: deps.policy,
      client: deps.client,
      logger: deps.logger,
      agentIds: deps.config.agentIds
    });

    if (result.runtimeFailed) {
      return reply.status(503).send(result.decision);
    }

    return reply.status(200).send(result.decision);
  });

  return { app, deps };
}

async function main(): Promise<void> {
  const { app, deps } = buildServer();
  await app.listen({ host: "0.0.0.0", port: deps.config.port });
  deps.logger.info("server_started", { port: deps.config.port });
}

const isMainModule = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;

if (isMainModule) {
  void main();
}
