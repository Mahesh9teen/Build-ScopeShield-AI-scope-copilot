const briefInput = document.querySelector("#brief");
const briefCount = document.querySelector("#brief-count");
const analyzeButton = document.querySelector("#analyze-button");
const compareButton = document.querySelector("#compare-button");
const scopeError = document.querySelector("#scope-error");
const requestError = document.querySelector("#request-error");
const scopeResults = document.querySelector("#scope-results");
const requestResults = document.querySelector("#request-results");
const agreedScopeInput = document.querySelector("#agreed-scope");
const newRequestInput = document.querySelector("#new-request");
const savedBadge = document.querySelector("#saved-badge");

const sampleBrief = `Create a five-page website for a neighborhood yoga studio.
Deliverables: home page, class schedule, instructor profiles, contact form, and responsive design.
The studio provides all copy and photography. Two rounds of revisions are included.
The project includes deployment to the studio's existing hosting account. Target launch is six weeks after kickoff.
Not mentioned: online class booking, member accounts, payment processing, ongoing maintenance, or copywriting.`;

function setError(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

async function postJson(endpoint, payload) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The request failed.");
  return result;
}

function setBusy(button, busy, busyLabel, normalLabel) {
  button.disabled = busy;
  button.querySelector("span").textContent = busy ? busyLabel : normalLabel;
}

function renderList(title, items) {
  if (!items.length) return "";
  return `<div class="result-block"><h4>${escapeHtml(title)}</h4><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function saveScope(value) {
  try {
    localStorage.setItem("scopeshield.agreedScope", value);
    savedBadge.hidden = !value;
    return true;
  } catch {
    savedBadge.hidden = true;
    return false;
  }
}

agreedScopeInput.addEventListener("input", () => {
  if (!saveScope(agreedScopeInput.value)) {
    setError(requestError, "Browser storage is unavailable. You can continue, but this scope will not be saved after a reload.");
  }
});

document.querySelectorAll(".step-item").forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.tab;
    document.querySelectorAll(".step-item").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelector("#scope-panel").hidden = tab !== "scope";
    document.querySelector("#request-panel").hidden = tab !== "request";
  });
});

briefInput.addEventListener("input", () => {
  briefCount.textContent = `${briefInput.value.length.toLocaleString()} / 20,000`;
});

document.querySelector("#load-sample").addEventListener("click", () => {
  briefInput.value = sampleBrief;
  briefInput.dispatchEvent(new Event("input"));
  briefInput.focus();
});

analyzeButton.addEventListener("click", async () => {
  setError(scopeError, "");
  scopeResults.hidden = true;
  setBusy(analyzeButton, true, "Reading brief…", "Clarify this scope");
  const originalBrief = briefInput.value;
  const previousScope = agreedScopeInput.value;
  try {
    const scope = await postJson("/api/analyze", { brief: originalBrief });
    if (agreedScopeInput.value === previousScope) {
      agreedScopeInput.value = originalBrief;
      if (!saveScope(originalBrief)) {
        setError(scopeError, "Analysis is ready, but browser storage is unavailable. The scope cannot be saved after a reload.");
      }
    }
    scopeResults.innerHTML = `
      <h3>Scope snapshot</h3>
      <p>${escapeHtml(scope.project_summary)}</p>
      <div class="result-grid">
        ${renderList("DELIVERABLES", scope.deliverables)}
        ${renderList("NOT INCLUDED / NOT SPECIFIED", scope.exclusions)}
        ${renderList("ASSUMPTIONS TO CONFIRM", scope.assumptions)}
        ${renderList("QUESTIONS TO ASK", scope.questions)}
      </div>`;
    scopeResults.hidden = false;
  } catch (error) {
    setError(scopeError, error.message);
  } finally {
    setBusy(analyzeButton, false, "", "Clarify this scope");
  }
});

compareButton.addEventListener("click", async () => {
  setError(requestError, "");
  requestResults.hidden = true;
  setBusy(compareButton, true, "Comparing…", "Review request");
  try {
    const result = await postJson("/api/compare", {
      agreedScope: agreedScopeInput.value,
      newRequest: newRequestInput.value,
    });
    requestResults.innerHTML = `
      <h3>Request review</h3>
      <span class="status-label ${result.status}">${escapeHtml(result.status.replaceAll("_", " "))} · ${escapeHtml(result.confidence)} confidence</span>
      <p>${escapeHtml(result.reasoning)}</p>
      <div class="result-grid">
        ${renderList("AFFECTED DELIVERABLES", result.affected_deliverables)}
        ${renderList("QUESTIONS TO CLARIFY", result.questions)}
      </div>
      <h4>DRAFT REPLY · REVIEW BEFORE SENDING</h4>
      <p class="reply-box" id="reply-text">${escapeHtml(result.suggested_reply)}</p>
      <button class="copy-button" id="copy-reply" type="button">Copy draft</button>`;
    requestResults.hidden = false;
    document.querySelector("#copy-reply").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      try {
        await navigator.clipboard.writeText(result.suggested_reply);
        button.textContent = "Copied";
      } catch {
        setError(requestError, "Could not copy the draft. Select the reply text and copy it manually.");
      }
    });
  } catch (error) {
    setError(requestError, error.message);
  } finally {
    setBusy(compareButton, false, "", "Review request");
  }
});

try {
  const savedScope = localStorage.getItem("scopeshield.agreedScope");
  if (savedScope) {
    agreedScopeInput.value = savedScope;
    savedBadge.hidden = false;
  }
} catch {
  setError(scopeError, "Browser storage is unavailable. You can still use the app, but your scope will not be saved.");
}

async function updateConnectionStatus() {
  const label = document.querySelector("#connection-status");
  const dot = document.querySelector("#status-dot");
  try {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error("Cannot check local AI status.");
    const health = await response.json();
    if (!health.connected) {
      label.textContent = "Ollama not running";
      label.title = health.error || "Start Ollama and reload this page.";
      dot.className = "status-dot offline";
    } else if (!health.modelAvailable) {
      label.textContent = `Install ${health.model}`;
      dot.className = "status-dot offline";
    } else {
      label.textContent = `Local AI · ${health.model}`;
      dot.className = "status-dot online";
    }
  } catch {
    label.textContent = "Local AI status unavailable";
    dot.className = "status-dot offline";
  }
}

void updateConnectionStatus();
