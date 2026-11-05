# FlowPilot

**A focused lead-processing, CRM and human-approval automation product.** The application receives an enquiry, extracts structured facts using a real model, applies deterministic business rules, updates a built-in CRM, drafts a follow-up, waits for a human decision, and records a test-mail or explicitly authorized SMTP delivery.

The stack is React / TypeScript / Tailwind, FastAPI / Pydantic / SQLAlchemy, PostgreSQL and n8n 2.46.6. The interface defaults to Chinese and includes English. All business state comes from the backend. A model or an external CRM integration is never claimed to be connected simply because its name appears in settings.

## Delivery status

This source contains Docker Compose, an importable n8n workflow, 30 fictional input rows, automated tests, HTTP acceptance scripts and deployment/commercial documentation. **Read [the verification record](docs/VERIFICATION.md) for what was actually exercised.** Fixture-model tests do not establish real-model quality; local-engine tests do not establish n8n integration; SQLite tests do not establish PostgreSQL deployment behavior.

The first release is a single-company, single-administrator deployment baseline. HubSpot, GoHighLevel, ERP connectors, multi-tenancy and a general-purpose agent builder are extension points, not delivered integrations.

## Start the complete stack

Install Docker Engine/Desktop with Compose v2 and Python 3.10+ for the setup helper. Allow access to the relevant image registries. A local model requires additional memory/disk and a model download.

```bash
python3 scripts/bootstrap.py
docker compose --profile ollama up -d --build
docker compose --profile ollama exec ollama ollama pull qwen2.5:1.5b
```

Compose automatically loads the bundled authenticated Webhook trigger. It strips request headers from emitted execution data while retaining native execution history. Importing the JSON into another n8n installation requires installing that supported custom node first; see [workflow instructions](n8n/README.md).

The helper asks you to choose the FlowPilot administrator password and generates unique database, session, encryption and webhook secrets into an ignored private `.env`. It never prints secrets or overwrites existing configuration.

**The commercial-delivery default, `qwen2.5:1.5b`, passed all 16 live n8n + Ollama acceptance checks** and uses [Apache 2.0](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/blob/main/LICENSE). The separate `qwen2.5:3b` run passed the same technical suite, but its [Research License](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/blob/main/LICENSE) requires a separate license for commercial use. It is retained as evaluation evidence, not a customer default; model sizes do not necessarily share license terms.

You may select another authorized and validated model through `LLM_MODEL` before the first startup, then pull that exact name. If you already saved model settings in the application, update them in Settings: persisted settings take precedence over environment variables. See the [verification matrix](docs/VERIFICATION.md) for the actual database, Docker and browser validation scope.

1. Open **http://localhost:5678** and finish the n8n first-run owner account setup. This is a separate local account.
2. Import, publish and activate the workflow in a maintenance window. The helper restarts this project's dedicated n8n container and may interrupt active executions:

```bash
python3 scripts/import-n8n.py
```

3. In n8n Settings → n8n API, create an API key with execution-read access. Enter it through the local hidden prompt to enable native final-state reconciliation:

```bash
python3 scripts/configure-n8n-status.py
docker compose up -d api worker
```

4. Open **http://localhost:3000**, sign in with your FlowPilot password, and check the model connection in Settings.
5. Submit through the public customer form at **http://localhost:3000/intake**, or create a test lead in the authenticated Inbox. Follow its actual execution to Approvals, edit and approve the exact draft version, and inspect the persisted message in Outbox.

After removing temporary credential files, the helper restarts n8n and waits up to 120 seconds for the production webhook's expected unauthenticated 401 response. It sends no key or valid business dispatch. Success is reported only after registration is confirmed; cleanup, restart or readiness failure returns a nonzero exit code with recovery commands. Do not assume publication is active after simply waiting 15 seconds. Fix the cause and use FlowPilot's execution retry action for previously failed dispatches.

### Use another real model

Skip the `ollama` profile when using an existing provider. Configure `LLM_PROVIDER=ollama` with the server base URL, or `LLM_PROVIDER=openai_compatible` with the provider's actual `/v1` base URL, model ID and API key. The same fields are available in the authenticated Settings page. Keys are write-only and stored encrypted when changed in the application.

For a native Mac/Windows Ollama service, the container URL is normally `http://host.docker.internal:11434`, provided the host service accepts container connections. The CPU-only container is a portable baseline, not a claim of GPU acceleration on macOS. See [integration details](docs/INTEGRATIONS.md).

Missing credentials, missing model weights, invalid JSON and unavailable services cause visible failures. The application never silently falls back to a deterministic model substitute.

## Isolated deterministic test deployment

This runs the real database, n8n, backend, CRM and approval/outbox modules. **Only the model responses use an explicitly enabled fixture provider.** Use this for behavioral regression, not an AI-quality demonstration.

```bash
python3 scripts/bootstrap.py --test
docker compose --env-file .env.test up -d --build
```

Complete n8n owner setup at **http://localhost:5679**, then:

```bash
python3 scripts/import-n8n.py --env-file .env.test
python3 scripts/configure-n8n-status.py --env-file .env.test
docker compose --env-file .env.test up -d api worker
```

Open **http://localhost:3001** and run the sample batch. The 30 rows include an exact duplicate, repeated contacts, missing fields, unrelated enquiries, invalid inputs and explicit fault injections. Some rows are expected to be rejected or fail. Tests have a separate Compose project, ports and data volume. A test event can never be externally emailed.

## Verify the installation

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r backend/requirements.txt pytest httpx
python3 -m pytest -q
node --test n8n/custom-nodes/FlowPilotWebhook.test.cjs
```

For a running fixture deployment:

```bash
python3 scripts/verify-live.py --env-file .env.test --require-n8n --report artifacts/http-e2e-fixture.json
```

For a configured real model and n8n:

```bash
python3 scripts/verify-live.py --env-file .env --require-n8n --require-live-model --report artifacts/http-e2e-live.json
```

The wrapper reads the private administrator password without placing it in shell arguments. The HTTP script records its actual engine/model provider and fails strict acceptance gates when they are not satisfied. Source tests and the verification report are the authority for tested assertions.

## Application pages

| Page | Purpose |
| --- | --- |
| Dashboard | Today's volume, errors, review items and approval queue |
| Public `/intake` | Submit an enquiry without console access; only receipt metadata is returned |
| Inbox | Administrator intake, CSV import, sample batch and event search |
| Event detail | Original input, extraction, rule rationale, CRM changes, draft and traces; field correction |
| CRM | Contacts, companies, leads, tasks, ownership and status updates |
| Workflow | Real phase status; business state distinguished from native n8n status |
| Approvals | Version-checked draft editing, test approval, rejection or save-only |
| Executions | Node attempts, sanitized errors, native execution IDs and manual recovery |
| Outbox | Persisted test messages and explicitly enabled SMTP outcomes |
| Settings | Real model configuration, authenticated ingress and integration status |

## Reliability and delivery semantics

Identical input is deduplicated. Reusing an idempotency key for different content is a conflict. Matching a contact does not erase a genuinely new enquiry. Classification and routing rules run outside the model. A pending draft, a persisted human approval and a unique delivery action are separate records.

Approval defaults to the test outbox. SMTP requires valid server settings, an explicit enable switch and authorization for the individual approved action. No test event can be sent externally. SMTP has an unavoidable ambiguity window when a remote server accepts mail before a local success commit; ambiguous results need reconciliation and are not blindly replayed.

`waiting_approval` is a business state. The n8n pipeline may already have ended, and approval queues a separate delivery execution. Missing native status evidence is shown as unknown rather than simulated as an n8n Wait node.

## Development

Run `npm ci && npm run dev` in `frontend/`. Vite serves port 5173 and proxies `/api` to `http://127.0.0.1:8000`; override `API_PROXY_TARGET` if needed. Set backend `PUBLIC_BASE_URL` to the browser origin for CSRF checks.

Run `uvicorn app.main:app --host 127.0.0.1 --port 8000` and `python -m app.worker` from `backend/`, with the documented variables injected into the process environment. The app does not execute `.env` as shell code. `WORKFLOW_ENGINE=local` is an explicit development alternative; it is labelled in the UI and is not n8n evidence.

## Further documentation

- [Chinese guide](README.md)
- [Architecture and recovery](docs/ARCHITECTURE.md)
- [Integrations and SMTP](docs/INTEGRATIONS.md)
- [Chinese/English demonstration script](docs/DEMO_SCRIPT.md)
- [Commercial scope and estimation](docs/COMMERCIAL.md)
- [Operations and recovery](docs/OPERATIONS.md)
- [Explicit boundaries](docs/BOUNDARIES.md)
- [Verification and unresolved items](docs/VERIFICATION.md)
- [Sample scenarios](docs/SCENARIOS.md)
- [n8n workflow details](n8n/README.md)
- [Third-party terms and official references](docs/SOURCES_AND_NOTICES.md)

The straightforward commercialization model is installation and customization on a customer-owned instance, with acceptance and maintenance in the contract. n8n has its own Sustainable Use License. Allowing external customers to build or configure workflows in a hosted offering requires review of n8n's commercial licensing requirements.
