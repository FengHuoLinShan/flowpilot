# FlowPilot API contract

Base: `/api`. Single company deployment. Lists return `{items: [...], total: n}`.
All console requests use a signed HttpOnly cookie, `credentials: same-origin`.
Write requests use `Content-Type: application/json` (except CSV), send the session's
`X-CSRF-Token` header. If an Origin header is supplied it must match configured
`PUBLIC_BASE_URL`. CORS is not open. Login needs no CSRF header.

## Session

- `GET /session` -> `{authenticated: boolean, user: {name,role}|null, csrf_token: string|null}`.
- `POST /login` `{password: string}` -> the same object; sets cookie.
- `POST /logout` -> `{ok:true}`.

## Intake

- `POST /events` JSON `{name?, company?, email?, phone?, message: string,
  requirement?, budget?: number|null, currency?: 'CNY'|'USD'|'EUR'|'AUD'|'GBP',
  source?: 'form'|'csv'|'api'|'demo', is_test?: boolean, fault?: string|null}`.
  Optional `Idempotency-Key` header. Returns `{event, execution, duplicate}`.
  The same key with a different payload returns 409. `fault` requires a test
  event and the server's explicit fault-injection switch.
- `POST /webhooks/leads`: same body, `X-Webhook-Key` authentication, no console cookie.
- `POST /import/csv`: multipart `file` plus optional `is_test=true` form field;
  columns match intake fields. Returns `{accepted,duplicates,rejected,results}`
  with per-row errors. Invalid rows never enter CRM.
- `POST /demo/run` `{}` or `{batch_key?: string}` -> `{accepted,duplicates,rejected,results}`.
  Demo input is tagged `is_test=true`; fixture LLM only exists when explicitly
  enabled by `FLOWPILOT_TEST_MODE=true` and `LLM_PROVIDER=fixture`.

## Event and execution detail

`GET /events` optionally `?status=&q=&is_test=true&limit=100&offset=0`.
Event item: `{id,source,is_test,status,name,company,email,created_at,updated_at,
  current_execution_id,priority,category,model_provider}`.

`GET /events/{id}` adds `{payload,extraction,classification,crm_changes,
  current_execution,executions,approvals,outbox,logs}`.

`POST /events/{id}/correct` `{fields:{name?,company?,email?,phone?,requirement?,
  budget?,currency?,intent?,confidence?,ambiguities?},reason:string}`.
  Only safe before final dispatch; old pending drafts are invalidated and a new
  execution resumes from classification with the corrected fields.

`GET /executions` lists `{id,event_id,status,phase,engine,current_node,attempt,
  created_at,updated_at,n8n_execution_id,error_code,error_message,is_test}`.
`GET /executions/{id}` adds `{nodes,logs,event}`.
Node: `{id,step,status,attempt,started_at,finished_at,duration_ms,
  error_code,error_message,output}`.
`POST /executions/{id}/retry` `{}` returns `{execution}`; retry is limited to
failed, stale, and review-resolved runs. Completed external sends never replay.

Status vocabulary: `queued,running,retrying,needs_review,waiting_approval,
succeeded,rejected,failed`. Node statuses: `running,succeeded,failed`.

## CRM

`GET /crm/contacts`: `{id,name,email,phone,company_id,company_name,created_at,updated_at}`.
`GET /crm/companies`: `{id,name,normalized_name,created_at}`.
`GET /crm/leads`: `{id,event_id,contact_id,company_id,name,company_name,email,
  requirement,budget,currency,priority,category,tags,status,owner,created_at,updated_at}`.
`GET /crm/tasks`: `{id,event_id,lead_id,title,owner,status,due_at,created_at}`.
`PATCH /crm/leads/{id}` `{status?:new|qualified|contacted|won|lost|disqualified,
  owner?:string}`. `PATCH /crm/tasks/{id}` `{status:open|done}`.

## Approvals and outbox

`GET /approvals` optionally `?status=pending`.
Item: `{id,event_id,execution_id,status,version,to_email,subject,body,
  recommendation,created_at,updated_at,decided_at,decision_reason,is_test,
  customer_name,company_name,priority,delivery_mode}`.
`PATCH /approvals/{id}` `{subject,body,to_email?,expected_version:number}`.
`POST /approvals/{id}/decision` `{decision:'approve'|'reject'|'save',
  expected_version:number,reason?:string,delivery_mode?:'test'|'smtp',
  authorize_external_send?:boolean}`.
Approval defaults to `test`. SMTP also requires enabled valid server settings;
test events can NEVER be sent externally. `save` records a saved draft and
completes the run without outbox dispatch. Returned `{approval,execution}`.
Duplicate same decisions are idempotent; stale versions or conflicting decisions
return 409. Editing after approval is rejected.
`GET /outbox` items `{id,event_id,approval_id,to_email,subject,body,mode,status,
  created_at,sent_at,message_id,is_test,error_code,error_message}`.

## Dashboard and settings

`GET /dashboard`: `{today_received,today_processed,pending_approvals,
  failed_executions,needs_review,contacts,total_leads,test_messages,
  status_counts,priority_counts,recent_events,recent_executions,
  engine,model_provider,model_configured,test_mode,service_time}`.

`GET /settings`: `{company_name,engine,llm_provider,llm_base_url,llm_model,
  llm_api_key_configured,llm_timeout_seconds,llm_max_retries,
  webhook_key_configured,webhook_url,crm_adapter,external_crm_configured:false,
  smtp_enabled,smtp_host,smtp_port,smtp_username,smtp_password_configured,
  smtp_from,smtp_starttls,public_base_url,n8n_base_url,n8n_workflow_url,
  test_mode,fault_injection_enabled}`. Secrets are never returned.
`PATCH /settings`: editable `company_name,llm_provider,llm_base_url,llm_model,
  llm_api_key,llm_timeout_seconds,llm_max_retries,smtp_enabled,smtp_host,
  smtp_port,smtp_username,smtp_password,smtp_from,smtp_starttls`.
`POST /settings/model/test` `{}` -> `{ok,provider,model,message}`; real configured
model connectivity test, not a fixture substitute.

## n8n internal

All internal endpoints require `X-FlowPilot-Internal` equal to
`FLOWPILOT_INTERNAL_KEY`. Every request also contains `{phase:'pipeline'|'delivery',
dispatch_token,n8n_execution_id}`. Dispatcher posts these values to the n8n
webhook with `X-FlowPilot-Internal`. Only run IDs cross the webhook, no raw PII.

- `POST /internal/executions/{id}/claim`
- `POST /internal/executions/{id}/steps/{step}`
- `POST /internal/executions/{id}/failure` additionally `{error_code?,error_message?}`

Step IDs: `extract,classify,crm,draft,await_approval,deliver,finish`.
Output `{run_id,proceed,phase,dispatch_token,needs_review,irrelevant,status}`.
Model calls occur in `extract` and `draft`; JSON validation and business rules are
owned by FastAPI. Pipeline: extract → classify → if review stop → crm → if
irrelevant finish → draft → await_approval. Approval is durably stored in DB.
Human approve queues the delivery phase: claim → deliver → finish.
