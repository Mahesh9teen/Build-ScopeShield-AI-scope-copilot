# ScopeShield

**Keep great work from becoming extra work.** ScopeShield is a local-first scope copilot for freelancers. It turns a project brief into a reviewable scope snapshot, compares new client requests with that scope, and drafts a reply for the freelancer to review.

## Features

- Extracts deliverables, exclusions or unspecified items, assumptions, and clarifying questions.
- Classifies a new request as in scope, possibly out of scope, or unclear, with a rationale.
- Drafts a client reply but never sends it.
- Uses Ollama on your computer; project briefs are not sent to a hosted AI API.
- Copies the original brief (not AI-generated assumptions) into Step 2. Review it to ensure it reflects the actual agreement.
- Saves that scope and subsequent edits in this browser's local storage. If storage is blocked, analysis still works and the app displays a warning.
- Includes a sample brief so you can try the flow.

## Requirements

- Node.js 18 or newer.
- [Ollama](https://ollama.com/) installed and running.
- An Ollama model. The default is `qwen2.5:3b`; check the model's current license and terms before using it in a commercial setting.

## Project structure

The repository can be named `Build-ScopeShield-AI-scope-copilot`. The frontend files live directly in the project root:

```text
Build-ScopeShield-AI-scope-copilot/
|-- index.html
|-- app.js
|-- styles.css
|-- server.js
|-- package.json
|-- README.md
|-- LICENSE
|-- .gitignore
`-- test/
    |-- app.test.js
    `-- server.test.js
```

The server serves only the three frontend files, not backend source, documentation, or tests. Use `npm start` rather than opening the HTML directly: AI workflows require the Node server and Ollama. Moving the frontend files to the root does not make GitHub Pages support the backend.

## Run locally

In a terminal, from this project folder:

```powershell
ollama pull qwen2.5:3b
npm start
```

Open <http://127.0.0.1:3000>. Click **Try a sample**, then **Clarify this scope**. After the scope is analyzed, open **Review a request**, enter a new ask, and compare it.

To use another model:

```powershell
$env:OLLAMA_MODEL = "your-model-name"
npm start
```

Keep the Ollama service running while using ScopeShield. On first run, model analysis may take a little while. The UI shows whether Ollama is running and whether the configured model is installed.

If you already have `llama3.2:latest` installed, you can run without downloading the default model:

```powershell
$env:OLLAMA_MODEL = "llama3.2:latest"
npm start
```

Environment variables set this way apply only to that PowerShell session. Set the variable again in a new terminal. A public GitHub repository or static hosting alone will not run the AI backend; this version is intended for local use.

### Troubleshooting

- **Ollama not running:** start the Ollama application and reload the page. The first service startup can take time while it checks your hardware.
- **Install qwen2.5:3b:** run `ollama pull qwen2.5:3b`, or select an installed model using `OLLAMA_MODEL` as shown above. Check available models with `ollama list`.
- **Model took too long:** inference is limited to two minutes per request. Try a shorter brief or a smaller installed model.
- **Invalid scope analysis/comparison:** the model did not return the required fields. Retry or use a different model; the app does not silently replace malformed results with a fabricated assessment.
- **Browser storage unavailable:** you can continue working, but the agreement will not survive a reload.
- **Could not copy the draft:** select the displayed reply and copy it manually.

## Tests

```powershell
npm test
```

Tests cover successful inference using a fake local-model client, invalid inputs and model responses, unavailable-model errors, HTTP routes, original-agreement preservation, browser storage failures, and clipboard behavior. They do not download a model or contact a real inference service.

To inspect coverage on a recent Node.js runtime:

```powershell
node --test --experimental-test-coverage
```

There is no bundler or dependency installation step: Node serves the static interface directly. For a real inference smoke test, start Ollama, run the app, analyze the sample, and compare a new request such as "Add a members-only portal." A passing unit suite alone does not certify model quality.

## How open AI matters

The model reads unstructured client language and turns it into a structured list that can be compared against a later request. Running the model through Ollama keeps brief processing local and gives users the option to choose a model that fits their needs. The model is advisory: it can misunderstand a brief, so a freelancer must verify the result and make all decisions.

## Limitations and privacy

- This is a prototype, not legal, pricing, or contract advice.
- AI assessments can be wrong or incomplete. Review all results and reply drafts before relying on or sharing them.
- The app sends text to the Ollama service on `127.0.0.1:11434`, not to a hosted inference API. Ollama model downloads require an internet connection, and Ollama may have its own telemetry or configuration; consult its documentation for details.
- The original agreement text and edits are saved in your browser's local storage. Avoid using this on a shared browser profile with confidential client information. Clear this site's storage in your browser to remove the saved text.
- The app listens only on `127.0.0.1` by default. Do not expose it publicly without adding authentication and a security review.

## Submission demo checklist

- [ ] Run the app and capture a short demo of both workflow steps.
- [ ] Try the sample, then test with a real brief only with the client's permission.
- [ ] Ask a freelancer to review the output; report their real feedback accurately.
- [ ] Add the public GitHub repository and demo link to the DEV submission.
- [ ] Explain the chosen model and why local/open AI mattered.

## License

MIT. See [LICENSE](./LICENSE).
