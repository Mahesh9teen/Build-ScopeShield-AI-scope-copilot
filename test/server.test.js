const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createServer,
  extractJson,
  normalizeAnalysis,
  normalizeComparison,
  validateText,
} = require("../server");

test("extractJson reads a JSON object wrapped in a markdown fence", () => {
  assert.deepEqual(extractJson('```json\n{"status":"unclear"}\n```'), { status: "unclear" });
});

test("extractJson rejects responses without a JSON object", () => {
  assert.throws(() => extractJson("I cannot produce JSON"), /did not return a JSON object/);
});

test("analysis normalization trims valid output", () => {
  const normalized = normalizeAnalysis({
    project_summary: "  Website  ",
    deliverables: ["Home page", "Schedule"],
    exclusions: [],
    assumptions: ["  Client supplies copy  "],
    questions: [],
  });
  assert.equal(normalized.project_summary, "Website");
  assert.deepEqual(normalized.deliverables, ["Home page", "Schedule"]);
  assert.deepEqual(normalized.exclusions, []);
  assert.deepEqual(normalized.assumptions, ["Client supplies copy"]);
});

test("comparison normalization rejects invalid classifications instead of inventing results", () => {
  assert.throws(() => normalizeComparison({
    status: "made-up",
    confidence: "certain",
    reasoning: "Changed work",
    suggested_reply: "Let me review that.",
  }), /invalid scope comparison/);
});

test("analysis normalization rejects empty or malformed model results", () => {
  for (const value of [null, [], {}, { project_summary: "Project", deliverables: "not a list" }]) {
    assert.throws(() => normalizeAnalysis(value), /invalid scope analysis/);
  }
});

test("validateText rejects missing and overly long text", () => {
  assert.throws(() => validateText("  ", "Brief"), { status: 400 });
  assert.throws(() => validateText("x".repeat(20_001), "Brief"), { status: 400 });
  assert.equal(validateText("  brief  ", "Brief"), "brief");
});

const analysis = {
  project_summary: "Studio website",
  deliverables: ["Home page", "Schedule"],
  exclusions: [],
  assumptions: ["Client supplies content"],
  questions: ["Who approves the design?"],
};
const comparison = {
  status: "possibly_out_of_scope",
  confidence: "medium",
  reasoning: "Member accounts were not agreed.",
  affected_deliverables: ["Website"],
  questions: ["Should we quote this separately?"],
  suggested_reply: "Thanks! Shall we discuss a separate scope for member accounts?",
};

async function startServer(context, options) {
  const server = createServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    post: (route, body) => fetch(`${origin}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  };
}

test("both AI endpoints send local structured requests and return validated results", async (context) => {
  const calls = [];
  const app = await startServer(context, {
    fetchImpl: async (url, options) => {
      calls.push({ url, payload: JSON.parse(options.body) });
      return Response.json({ message: { content: JSON.stringify(calls.length === 1 ? analysis : comparison) } });
    },
  });
  const analyzed = await app.post("/api/analyze", { brief: "Studio website" });
  assert.equal(analyzed.status, 200);
  assert.deepEqual(await analyzed.json(), analysis);
  const compared = await app.post("/api/compare", { agreedScope: "Home page and schedule", newRequest: "Add member accounts" });
  assert.equal(compared.status, 200);
  assert.deepEqual(await compared.json(), comparison);
  assert.equal(calls[0].url, "http://127.0.0.1:11434/api/chat");
  assert.equal(calls[0].payload.stream, false);
  assert.equal(calls[0].payload.format, "json");
  assert.match(calls[1].payload.messages[1].content, /Home page and schedule/);
});

test("API input validation handles null, arrays, missing fields and both maximum-length inputs", async (context) => {
  let calls = 0;
  const app = await startServer(context, {
    fetchImpl: async () => {
      calls++;
      return Response.json({ message: { content: JSON.stringify(comparison) } });
    },
  });
  for (const input of [null, [], 7, {}, { brief: 7 }, { brief: "x".repeat(20001) }]) {
    const response = await app.post("/api/analyze", input);
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, "string");
  }
  const missingRequest = await app.post("/api/compare", { agreedScope: "scope" });
  assert.equal(missingRequest.status, 400);
  assert.equal(calls, 0);
  const maximum = await app.post("/api/compare", {
    agreedScope: "\n".repeat(19999) + "a",
    newRequest: "漢".repeat(20000),
  });
  assert.equal(maximum.status, 200);
  assert.equal(calls, 1);
});

test("AI failures return errors, not successful placeholder assessments", async (context) => {
  const failures = [
    { response: Response.json({ error: "missing" }, { status: 404 }), pattern: /ollama pull/ },
    { response: Response.json({ error: "failed" }, { status: 500 }), pattern: /HTTP 500/ },
    { response: Response.json({}), pattern: /unexpected response/ },
    { response: Response.json({ message: { content: "{}" } }), pattern: /invalid scope analysis/ },
    { response: Response.json({ message: { content: "not json" } }), pattern: /JSON object/ },
    { error: new TypeError("fetch failed"), pattern: /Cannot reach Ollama/ },
    { error: Object.assign(new Error("aborted"), { name: "AbortError" }), pattern: /too long/ },
  ];
  for (const failure of failures) {
    const app = await startServer(context, {
      fetchImpl: async () => {
        if (failure.error) throw failure.error;
        return failure.response;
      },
    });
    const response = await app.post("/api/analyze", { brief: "Website" });
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, failure.pattern);
  }
});

test("health distinguishes ready, missing-model and offline states", async (context) => {
  for (const state of ["ready", "missing", "offline"]) {
    const app = await startServer(context, {
      model: "test:latest",
      fetchImpl: async () => {
        if (state === "offline") throw new TypeError("fetch failed");
        return Response.json({ models: state === "ready" ? [{ name: "test:latest" }] : [] });
      },
    });
    const response = await fetch(`${app.origin}/api/health`);
    const health = await response.json();
    assert.equal(health.connected, state !== "offline");
    assert.equal(health.modelAvailable, state === "ready");
    if (state === "offline") assert.equal(typeof health.error, "string");
  }
});

test("routes, malformed JSON, oversized bodies and static paths fail explicitly", async (context) => {
  const app = await startServer(context, { fetchImpl: async () => { throw new Error("Unexpected model call"); } });
  const cases = [
    { path: "/api/missing", method: "POST", body: "{}", status: 404 },
    { path: "/api/analyze", method: "GET", status: 405 },
    { path: "/api/analyze", method: "POST", body: "{", status: 400 },
    { path: "/api/analyze", method: "POST", body: "x".repeat(250001), status: 413 },
    { path: "/missing.js", status: 404 },
    { path: "/server.js", status: 404 },
    { path: "/package.json", status: 404 },
    { path: "/README.md", status: 404 },
    { path: "/test/server.test.js", status: 404 },
    { path: "/%ZZ", status: 400 },
    { path: "/..%5cserver.js", status: 403 },
    { path: "/", method: "POST", status: 405 },
  ];
  for (const item of cases) {
    const response = await fetch(`${app.origin}${item.path}`, { method: item.method, body: item.body });
    assert.equal(response.status, item.status, item.path);
    assert.equal(typeof (await response.json()).error, "string");
  }
  for (const asset of ["/index.html", "/styles.css", "/app.js"]) {
    const response = await fetch(`${app.origin}${asset}`);
    assert.equal(response.status, 200);
  }
});

test("server serves the app and validates API input without calling the model", async (context) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Keep great work/);
  assert.equal(page.headers.get("content-security-policy")?.includes("default-src 'self'"), true);

  const invalidInput = await fetch(`${origin}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brief: "" }),
  });
  assert.equal(invalidInput.status, 400);
  assert.deepEqual(await invalidInput.json(), { error: "Project brief is required." });
});
