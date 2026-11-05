"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlowPilotWebhook = void 0;
/**
 * FlowPilot authenticated intake trigger.
 * Authentication headers are deliberately never emitted into execution data.
 * This is a supported custom n8n node, not a modification to n8n's engine.
 */
const node_crypto_1 = require("node:crypto");
function reject(context, status, code) {
    context.getResponseObject().status(status).json({ error: code });
    return { noWebhookResponse: true };
}
class FlowPilotWebhook {
    description = {
        displayName: 'FlowPilot Authenticated Webhook',
        name: 'flowPilotWebhook',
        icon: 'fa:bolt',
        group: ['trigger'],
        version: 1,
        description: 'Authenticates a FlowPilot dispatch and emits only its run ID, phase and fencing value',
        defaults: { name: 'Authenticated intake' },
        inputs: [],
        outputs: ['main'],
        credentials: [{ name: 'httpHeaderAuth', required: true }],
        webhooks: [{
                name: 'default',
                httpMethod: 'POST',
                responseMode: 'onReceived',
                responseCode: '={{ 202 }}',
                isFullPath: true,
                path: '={{ $parameter.path }}',
            }],
        properties: [{
                displayName: 'Path',
                name: 'path',
                type: 'string',
                default: 'flowpilot',
                required: true,
                description: 'Internal dispatch path. Mandatory Header Auth is enforced before execution.',
            }],
    };
    async webhook() {
        let credential;
        try {
            credential = await this.getCredentials('httpHeaderAuth');
        }
        catch {
            return reject(this, 503, 'INTERNAL_AUTH_NOT_CONFIGURED');
        }
        const expected = credential.value;
        const configuredName = String(credential.name ?? '').toLowerCase();
        if (configuredName !== 'x-flowpilot-internal' || typeof expected !== 'string' || expected.length < 24) {
            return reject(this, 503, 'INTERNAL_AUTH_NOT_CONFIGURED');
        }
        const request = this.getRequestObject();
        const provided = request.headers['x-flowpilot-internal'];
        if (typeof provided !== 'string' || provided.length > 512) {
            return reject(this, 401, 'UNAUTHORIZED');
        }
        const wanted = Buffer.from(expected, 'utf8');
        const received = Buffer.from(provided, 'utf8');
        if (wanted.length !== received.length || !(0, node_crypto_1.timingSafeEqual)(wanted, received)) {
            return reject(this, 401, 'UNAUTHORIZED');
        }
        if (!/^application\/json(?:;|$)/i.test(String(request.headers['content-type'] ?? ''))) {
            return reject(this, 415, 'JSON_REQUIRED');
        }
        const declaredLength = request.headers['content-length'];
        if (declaredLength && Number(declaredLength) > 2048) {
            return reject(this, 413, 'DISPATCH_TOO_LARGE');
        }
        const payload = request.body;
        if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
            return reject(this, 400, 'INVALID_DISPATCH');
        }
        const body = payload;
        const keys = Object.keys(body);
        if (keys.length !== 3 || keys.some((key) => !['run_id', 'phase', 'dispatch_token'].includes(key))) {
            return reject(this, 400, 'INVALID_DISPATCH');
        }
        if (typeof body.run_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.run_id)) {
            return reject(this, 400, 'INVALID_DISPATCH');
        }
        if (body.phase !== 'pipeline' && body.phase !== 'delivery') {
            return reject(this, 400, 'INVALID_DISPATCH');
        }
        if (typeof body.dispatch_token !== 'string' || !/^[A-Za-z0-9_-]{24,128}$/.test(body.dispatch_token)) {
            return reject(this, 400, 'INVALID_DISPATCH');
        }
        // Never return request, headers, credentials, query, cookies, or arbitrary body fields.
        return {
            webhookResponse: { accepted: true },
            workflowData: [[{ json: { body: {
                                run_id: body.run_id,
                                phase: body.phase,
                                dispatch_token: body.dispatch_token,
                            } } }]],
        };
    }
}
exports.FlowPilotWebhook = FlowPilotWebhook;
