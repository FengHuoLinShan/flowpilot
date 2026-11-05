const test = require('node:test');
const assert = require('node:assert/strict');
const { FlowPilotWebhook } = require('./FlowPilotWebhook.node.js');
const secret = 'unit-test-only-header-credential-123456789';
const validBody = { run_id: '12345678-1234-4123-8123-123456789abc', phase: 'pipeline', dispatch_token: 'f'.repeat(64) };

async function invoke({ body = validBody, header = secret, headers = {}, configured = true } = {}) {
  let status = 202; let response;
  const context = {
    async getCredentials() {
      if (!configured) throw new Error('unconfigured');
      return { name: 'x-flowpilot-internal', value: secret };
    },
    getRequestObject() { return { headers: { 'content-type': 'application/json', 'x-flowpilot-internal': header, cookie: 'private-cookie', authorization: 'private-authorization', ...headers }, body, query: { secret: 'not-output' } }; },
    getResponseObject() { return { status(value) { status=value; return this; }, json(value) { response=value; return this; } }; },
  };
  const output=await new FlowPilotWebhook().webhook.call(context);
  return { status, response, output };
}

test('authenticated trigger emits only the whitelisted dispatch fields', async () => {
  const result=await invoke();
  assert.deepEqual(result.output.workflowData, [[{ json: { body: validBody } }]]);
  const serialized=JSON.stringify(result);
  for(const forbidden of [secret, 'private-cookie', 'private-authorization', 'not-output', 'headers']) assert.equal(serialized.includes(forbidden),false);
});

test('wrong and missing authentication never starts a workflow or discloses a secret', async () => {
  for(const header of [undefined, '', 'wrong-secret', 'x'.repeat(512), [secret]]) {
    const result=await invoke({header:header === undefined ? null : header});
    assert.equal(result.status,401);
    assert.equal(result.output.workflowData,undefined);
    assert.equal(JSON.stringify(result).includes(secret),false);
  }
});

test('unconfigured credential fails closed with a generic response', async () => {
  const result=await invoke({configured:false});
  assert.equal(result.status,503);
  assert.equal(result.output.workflowData,undefined);
});

test('malformed, oversized or unexpected body values never reach execution storage', async () => {
  const bodies=[null, [], 'text', { ...validBody, api_key: secret }, { ...validBody, run_id: '../not-a-uuid' }, { ...validBody, phase:'approve' }, { ...validBody, dispatch_token:'tiny' }, { ...validBody, dispatch_token:'f'.repeat(129) }];
  for(const body of bodies) {
    const result=await invoke({body});
    assert.equal(result.status,400);
    assert.equal(result.output.workflowData,undefined);
    assert.equal(JSON.stringify(result).includes(secret),false);
  }
  assert.equal((await invoke({headers:{'content-length':'2049'}})).status,413);
  assert.equal((await invoke({headers:{'content-type':'text/plain'}})).status,415);
});

test('delivery phase is accepted only as a dispatch; backend must still require approval', async () => {
  const body={...validBody,phase:'delivery'};
  const result=await invoke({body});
  assert.deepEqual(result.output.workflowData, [[{json:{body}}]]);
});
