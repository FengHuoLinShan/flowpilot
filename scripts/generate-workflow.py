#!/usr/bin/env python3
"""Generate the importable, credential-free n8n orchestration definition."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

WORKFLOW_ID = "flowpilotLeadPipelineV1"
CREDENTIAL = {"httpHeaderAuth": {"id": "flowpilotInternalHeader1", "name": "FlowPilot internal API"}}

def uid(name: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"https://flowpilot.local/workflow/v1/{name}"))

def generate(api_base: str = "http://api:8000") -> dict:
    nodes: list[dict] = []
    links: dict = {}
    def add(name, kind, pos, params, version=1, **extra):
        node = {"id": uid(name), "name": name, "type": kind, "typeVersion": version,
                "position": list(pos), "parameters": params, **extra}
        nodes.append(node)
        return name
    def connect(source, target, output=0):
        outputs = links.setdefault(source, {"main": []})["main"]
        while len(outputs) <= output:
            outputs.append([])
        outputs[output].append({"node": target, "type": "main", "index": 0})
    body = "={{ { phase: $('Authenticated intake').first().json.body.phase, dispatch_token: $('Authenticated intake').first().json.body.dispatch_token, n8n_execution_id: $execution.id } }}"
    def request(name, suffix, pos, *, error=True, failure=False):
        payload = body
        if failure:
            payload = "={{ { phase: $('Authenticated intake').first().json.body.phase, dispatch_token: $('Authenticated intake').first().json.body.dispatch_token, n8n_execution_id: $execution.id, error_code: 'N8N_NODE_FAILED', error_message: 'A workflow service call failed after bounded retries. See the recorded backend node error.' } }}"
        base = api_base.rstrip('/')
        params = {"method": "POST", "url": "={{ '" + base + "/api/internal/executions/' + $('Authenticated intake').first().json.body.run_id + '/" + suffix + "' }}",
                  "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
                  "sendBody": True, "specifyBody": "json", "jsonBody": payload,
                  "options": {"timeout": 420000, "redirect": {"redirect": {"followRedirects": False}}}}
        add(name, "n8n-nodes-base.httpRequest", pos, params, 4.2,
            credentials=CREDENTIAL, retryOnFail=True, maxTries=3, waitBetweenTries=2000,
            onError="continueErrorOutput" if error else "stopWorkflow")
        if error:
            connect(name, "Record failure", 1)
        return name
    def condition(name, field, pos, value=None):
        operator = {"type": "boolean", "operation": "true", "singleValue": True} if value is None else {"type": "string", "operation": "equals"}
        add(name, "n8n-nodes-base.if", pos, {"conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
            "conditions": [{"id": uid(name + "-rule"), "leftValue": "={{ $json." + field + " }}", "rightValue": "" if value is None else value, "operator": operator}],
            "combinator": "and"}, "options": {}}, 2.2)
    add("Authenticated intake", "CUSTOM.flowPilotWebhook", (-1000, 160),
        {"path": "flowpilot"},
        1, webhookId=uid("webhook"), credentials=CREDENTIAL,
        notes="Bundled custom trigger authenticates the encrypted Header Auth credential, then emits only run_id, phase and dispatch_token. Authentication headers never enter execution history.", notesInFlow=True)
    request("Claim execution", "claim", (-760, 160))
    condition("Claim accepted?", "proceed", (-520, 160))
    condition("Delivery phase?", "phase", (-280, 80), "delivery")
    request("Extract with LLM", "steps/extract", (-20, 240))
    request("Apply business rules", "steps/classify", (220, 240))
    condition("Needs human correction?", "needs_review", (460, 240))
    request("Review checkpoint", "steps/finish", (700, 0))
    request("Upsert built-in CRM", "steps/crm", (700, 320))
    condition("Unrelated enquiry?", "irrelevant", (940, 320))
    request("Complete disqualified lead", "steps/finish", (1180, 120))
    request("Draft with LLM", "steps/draft", (1180, 400))
    request("Create approval checkpoint", "steps/await_approval", (1420, 400))
    request("Deliver approved action", "steps/deliver", (-20, -200))
    request("Complete delivery", "steps/finish", (220, -200))
    add("Duplicate or stale dispatch", "n8n-nodes-base.noOp", (-280, 560), {})
    request("Record failure", "failure", (700, 720), error=False, failure=True)
    add("Fail native execution", "n8n-nodes-base.stopAndError", (960, 720),
        {"errorType": "errorMessage", "errorMessage": "FlowPilot service call failed. The business execution contains sanitized recovery details."})
    add("Approval is a durable checkpoint", "n8n-nodes-base.stickyNote", (1150, -140),
        {"height": 260, "width": 560, "color": 5,
         "content": "## Human approval is mandatory\nThe pipeline ends after the approval record is committed to PostgreSQL. It does not send email.\n\nAn authenticated person edits and approves the exact draft version in FlowPilot. Only then does the server enqueue the `delivery` phase. `deliver` rechecks the persisted decision and unique delivery action.\n\nBusiness `waiting_approval` is separate from n8n's native execution status. The dashboard never invents an n8n Wait state."})
    for a,b in [("Authenticated intake","Claim execution"),("Claim execution","Claim accepted?"),
                ("Extract with LLM","Apply business rules"),("Apply business rules","Needs human correction?"),
                ("Upsert built-in CRM","Unrelated enquiry?"),("Draft with LLM","Create approval checkpoint"),
                ("Deliver approved action","Complete delivery"),("Record failure","Fail native execution")]:
        connect(a,b)
    connect("Claim accepted?", "Delivery phase?",0)
    connect("Claim accepted?", "Duplicate or stale dispatch",1)
    connect("Delivery phase?", "Deliver approved action",0)
    connect("Delivery phase?", "Extract with LLM",1)
    connect("Needs human correction?", "Review checkpoint",0)
    connect("Needs human correction?", "Upsert built-in CRM",1)
    connect("Unrelated enquiry?", "Complete disqualified lead",0)
    connect("Unrelated enquiry?", "Draft with LLM",1)
    return {"id": WORKFLOW_ID, "name": "FlowPilot — Lead processing and approved delivery", "active": False,
            "nodes": nodes, "connections": links, "pinData": {},
            "settings": {"executionOrder": "v1", "timezone": "Asia/Shanghai", "executionTimeout": 1800,
                         "saveDataSuccessExecution": "all", "saveDataErrorExecution": "all", "saveManualExecutions": True, "saveExecutionProgress": False},
            "versionId": uid("version-1"), "meta": {"templateCredsSetupCompleted": False}, "tags": []}

if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-base", default="http://api:8000")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1]/"n8n"/"lead-pipeline.json")
    args=parser.parse_args()
    if not args.api_base.startswith(("http://", "https://")) or "'" in args.api_base or "\n" in args.api_base:
        parser.error("api-base must be an HTTP(S) URL without quotes or line breaks")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(generate(args.api_base), ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(f"Wrote credential-free workflow: {args.output}")
