const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const appPath = path.join(__dirname, "..", "app.js");
const source = fs.readFileSync(appPath, "utf8");

function createApp({ storageBlocked = false, clipboardBlocked = false, health = "ready", failRequest = false } = {}) {
  const elements = new Map();
  function element(selector) {
    if (!elements.has(selector)) {
      const handlers = {};
      const value = {
        value: "", textContent: "", innerHTML: "", hidden: true, disabled: false,
        handlers, dataset: {},
        classList: { toggle() {} },
        addEventListener(type, handler) { handlers[type] = handler; },
        querySelector() { return element(`${selector} span`); },
        dispatchEvent(event) { handlers[event.type]?.(event); },
        focus() {},
      };
      elements.set(selector, value);
    }
    return elements.get(selector);
  }
  const steps = ["scope", "request"].map((tab) => {
    const button = element(`[data-tab=${tab}]`);
    button.dataset.tab = tab;
    return button;
  });
  const storage = new Map();
  const clipboard = [];
  const requests = [];
  const context = vm.createContext({
    document: { querySelector: element, querySelectorAll: () => steps },
    Event: class { constructor(type) { this.type = type; } },
    localStorage: {
      getItem(key) { if (storageBlocked) throw new Error("Storage blocked"); return storage.get(key) || null; },
      setItem(key, value) { if (storageBlocked) throw new Error("Storage blocked"); storage.set(key, value); },
    },
    navigator: { clipboard: { async writeText(value) {
      if (clipboardBlocked) throw new Error("Clipboard blocked");
      clipboard.push(value);
    } } },
    fetch: async (url, options) => {
      if (url === "/api/health") {
        if (health === "failed") throw new Error("Offline");
        return { ok: true, json: async () => ({
          connected: health !== "offline", modelAvailable: health === "ready", model: "test",
        }) };
      }
      requests.push(JSON.parse(options.body));
      if (failRequest) return { ok: false, json: async () => ({ error: "Model unavailable" }) };
      return { ok: true, json: async () => url === "/api/analyze" ? {
        project_summary: "AI summary", deliverables: ["AI deliverable"],
        exclusions: [], assumptions: ["AI assumption"], questions: [],
      } : {
        status: "unclear", confidence: "low", reasoning: "Check agreement",
        affected_deliverables: [], questions: [], suggested_reply: "Please clarify.",
      } };
    },
  });
  vm.runInContext(source, context, { filename: appPath });
  async function click(selector) {
    const button = element(selector);
    const event = { currentTarget: button };
    const promise = button.handlers.click(event);
    event.currentTarget = null;
    await promise;
  }
  return { element, click, storage, requests, clipboard };
}

test("analysis preserves the original agreement rather than treating AI assumptions as agreed scope", async () => {
  const app = createApp();
  app.element("#brief").value = "Original contract: one page, two revisions.";
  await app.click("#analyze-button");
  assert.equal(app.element("#agreed-scope").value, "Original contract: one page, two revisions.");
  assert.equal(app.element("#scope-results").hidden, false);
  assert.equal(app.element("#analyze-button").disabled, false);
});

test("copy draft survives asynchronous clipboard completion", async () => {
  const app = createApp();
  app.element("#agreed-scope").value = "One page";
  app.element("#new-request").value = "Add a page";
  await app.click("#compare-button");
  await app.click("#copy-reply");
  assert.equal(app.element("#copy-reply").textContent, "Copied");
  assert.deepEqual(app.clipboard, ["Please clarify."]);
});

test("blocked browser storage does not prevent analysis and reports a persistence warning", async () => {
  const app = createApp({ storageBlocked: true });
  app.element("#brief").value = "One page";
  await app.click("#analyze-button");
  assert.equal(app.element("#scope-results").hidden, false);
  assert.match(app.element("#scope-error").textContent, /save|storage/i);
});

test("clipboard rejection shows a recoverable error instead of an unhandled promise", async () => {
  const app = createApp({ clipboardBlocked: true });
  await app.click("#compare-button");
  await app.click("#copy-reply");
  assert.match(app.element("#request-error").textContent, /copy|clipboard/i);
});

test("sample loading, counters and workflow navigation work", async () => {
  const app = createApp();
  await app.click("#load-sample");
  assert.match(app.element("#brief").value, /yoga studio/);
  assert.match(app.element("#brief-count").textContent, /468/);
  await app.click("[data-tab=request]");
  assert.equal(app.element("#scope-panel").hidden, true);
  assert.equal(app.element("#request-panel").hidden, false);
  await app.click("[data-tab=scope]");
  assert.equal(app.element("#scope-panel").hidden, false);
});

test("manual agreement edits are saved without replacing them with an AI summary", () => {
  const app = createApp();
  app.element("#agreed-scope").value = "Confirmed scope";
  app.element("#agreed-scope").dispatchEvent({ type: "input" });
  assert.equal(app.storage.get("scopeshield.agreedScope"), "Confirmed scope");
});

test("API errors restore buttons and show errors in both workflows", async () => {
  const app = createApp({ failRequest: true });
  for (const [button, error] of [["#analyze-button", "#scope-error"], ["#compare-button", "#request-error"]]) {
    await app.click(button);
    assert.equal(app.element(button).disabled, false);
    assert.equal(app.element(error).textContent, "Model unavailable");
  }
});

test("health labels distinguish offline, missing model and unavailable status", async () => {
  for (const [health, expected] of [
    ["offline", "Ollama not running"],
    ["missing", "Install test"],
    ["failed", "Local AI status unavailable"],
  ]) {
    const app = createApp({ health });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(app.element("#connection-status").textContent, expected);
  }
});
