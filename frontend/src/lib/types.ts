export type Locale = "zh" | "en";
export type View =
  | "dashboard"
  | "inbox"
  | "crm"
  | "workflow"
  | "approvals"
  | "executions"
  | "outbox"
  | "settings";
export interface Session {
  authenticated: boolean;
  user: { name: string; role: string } | null;
  csrf_token?: string | null;
}
export interface EventRecord {
  id: string;
  source: string;
  is_test: boolean;
  status: string;
  name?: string;
  company?: string;
  email?: string;
  created_at: string;
  updated_at: string;
  current_execution_id?: string;
  priority?: string;
  category?: string;
  model_provider?: string;
}
export interface Extraction {
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  requirement?: string | null;
  budget?: number | null;
  currency?: string;
  intent?: string;
  confidence?: number;
  ambiguities?: string[];
  [key: string]: unknown;
}
export interface Classification {
  priority?: string;
  category?: string;
  reasons?: string[];
  missing_fields?: string[];
  needs_review?: boolean;
  irrelevant?: boolean;
  [key: string]: unknown;
}
export interface Audit {
  id?: string;
  action?: string;
  message?: string;
  step?: string;
  level?: string;
  created_at: string;
  details?: unknown;
  data?: unknown;
  actor?: string;
  [key: string]: unknown;
}
export interface NodeRun {
  id: string;
  step: string;
  status: string;
  attempt: number;
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
  error_code?: string;
  error_message?: string;
  output?: unknown;
}
export interface NativeRun {
  id: string;
  phase: string;
  attempt: number;
  observed_status?: string | null;
  started_at?: string;
  checked_at?: string;
}
export interface Execution {
  id: string;
  event_id: string;
  status: string;
  phase: string;
  engine: string;
  current_node?: string;
  attempt: number;
  created_at: string;
  updated_at: string;
  n8n_execution_id?: string | null;
  n8n_status?: string | null;
  n8n_runs?: NativeRun[];
  error_code?: string | null;
  error_message?: string | null;
  is_test: boolean;
  nodes?: NodeRun[];
  logs?: Audit[];
  event?: EventRecord;
}
export interface Approval {
  id: string;
  event_id: string;
  execution_id: string;
  status: string;
  version: number;
  to_email: string;
  subject: string;
  body: string;
  recommendation?: string;
  created_at: string;
  updated_at: string;
  decided_at?: string;
  decision_reason?: string;
  is_test: boolean;
  customer_name?: string;
  company_name?: string;
  priority?: string;
  delivery_mode?: string;
}
export interface Outbox {
  id: string;
  event_id: string;
  approval_id: string;
  to_email: string;
  subject: string;
  body: string;
  mode: string;
  status: string;
  created_at: string;
  sent_at?: string;
  message_id?: string;
  is_test: boolean;
  error_code?: string;
  error_message?: string;
}
export interface EventDetail extends EventRecord {
  payload: Record<string, unknown>;
  extraction?: Extraction | null;
  classification?: Classification | null;
  crm_changes?: Record<string, unknown> | null;
  current_execution?: Execution | null;
  executions?: Execution[];
  approvals?: Approval[];
  outbox?: Outbox[];
  logs?: Audit[];
}
export interface Dashboard {
  today_received: number;
  today_processed: number;
  pending_approvals: number;
  failed_executions: number;
  needs_review: number;
  contacts: number;
  total_leads: number;
  test_messages: number;
  status_counts: Record<string, number>;
  priority_counts: Record<string, number>;
  recent_events: EventRecord[];
  recent_executions: Execution[];
  engine: string;
  model_provider: string;
  model_configured: boolean;
  test_mode: boolean;
  service_time: string;
  day_timezone?: string;
}
export interface Settings {
  company_name: string;
  engine: string;
  llm_provider: string;
  llm_base_url: string;
  llm_model: string;
  llm_api_key_configured: boolean;
  llm_timeout_seconds: number;
  llm_max_retries: number;
  webhook_key_configured: boolean;
  webhook_url: string;
  crm_adapter: string;
  external_crm_configured: boolean;
  smtp_enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password_configured: boolean;
  smtp_from: string;
  smtp_starttls: boolean;
  public_base_url: string;
  n8n_base_url: string;
  n8n_workflow_url: string;
  test_mode: boolean;
  fault_injection_enabled: boolean;
}
export interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company_id?: string;
  company_name?: string;
  created_at: string;
  updated_at: string;
  is_test?: boolean;
}
export interface Company {
  id: string;
  name: string;
  normalized_name: string;
  created_at: string;
  is_test?: boolean;
}
export interface Lead {
  id: string;
  event_id: string;
  contact_id: string;
  company_id?: string;
  name: string;
  company_name?: string;
  email?: string;
  requirement: string;
  budget?: number;
  currency?: string;
  priority: string;
  category: string;
  tags: string[];
  status: string;
  owner?: string;
  created_at: string;
  updated_at: string;
  is_test?: boolean;
}
export interface Task {
  id: string;
  event_id: string;
  lead_id: string;
  title: string;
  owner?: string;
  status: string;
  due_at?: string;
  created_at: string;
  is_test?: boolean;
}
export interface BatchRow {
  row?: number;
  ok?: boolean;
  status?: string;
  error?: string;
  error_code?: string;
  message?: string;
  errors?: { field?: string; message?: string }[];
  detail?: unknown;
  event_id?: string;
  [key: string]: unknown;
}
export interface BatchResult {
  accepted: number;
  duplicates: number;
  rejected: number;
  results?: BatchRow[];
}
export type Notice = {
  kind: "success" | "error" | "info";
  title: string;
  detail?: string;
  id: number;
};
export type Notify = (
  kind: Notice["kind"],
  title: string,
  detail?: string,
) => void;
export type Translate = (zh: string, en: string) => string;
