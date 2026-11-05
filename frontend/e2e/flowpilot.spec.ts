import { expect, test, type Page } from '@playwright/test';

const password = process.env.FLOWPILOT_ADMIN_PASSWORD;
test.beforeAll(() => {
  if (!password) throw new Error('Set FLOWPILOT_ADMIN_PASSWORD for the running test deployment.');
});

async function login(page: Page) {
  await page.goto('/');
  await page.getByTestId('login-password').fill(password!);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('new-lead')).toBeVisible();
}

test('real form → persisted CRM → edited approval → exactly one test outbox item', async ({ page }) => {
  await login(page);
  const nonce = `${Date.now()}`;
  const name = `端到端客户${nonce}`;
  const email = `browser-${nonce}@example.com`;
  await page.getByTestId('new-lead').click();
  await page.getByTestId('lead-name').fill(name);
  await page.getByTestId('lead-company').fill(`端到端制造企业${nonce}`);
  await page.getByTestId('lead-email').fill(email);
  await page.getByTestId('lead-budget').fill('120000');
  await page.getByTestId('lead-message').fill('我们需要为 B2B 销售团队部署 CRM 自动化和 AI 客服。预算120000人民币，预计两周后开始，请安排方案演示和报价。');
  const creation = page.waitForResponse(r => r.url().endsWith('/api/events') && r.request().method() === 'POST');
  await page.getByTestId('lead-submit').click();
  const receipt = await (await creation).json();
  expect(receipt.event.id).toBeTruthy();
  await expect.poll(async () => {
    const r = await page.request.get(`/api/events/${receipt.event.id}`);
    return (await r.json()).status;
  }, { timeout: 150_000 }).toBe('waiting_approval');
  const before = await (await page.request.get('/api/outbox')).json();
  expect(before.items.filter((item: { event_id: string }) => item.event_id === receipt.event.id)).toHaveLength(0);
  await page.goto('/#approvals');
  await page.getByRole('button').filter({ hasText: name }).first().click();
  const subject = `人工编辑后的测试邮件 ${nonce}`;
  await page.getByLabel('主题', { exact: true }).fill(subject);
  await page.getByLabel('邮件正文', { exact: true }).fill('您好，我们已经人工确认您的需求，并邀请您安排一次业务需求访谈。此邮件仅用于内部测试验收，不会外发。');
  await page.getByRole('button', { name: '批准到测试发件箱', exact: true }).click();
  await expect.poll(async () => {
    const r = await page.request.get(`/api/events/${receipt.event.id}`);
    return (await r.json()).status;
  }, { timeout: 90_000 }).toBe('succeeded');
  await page.goto('/#outbox');
  await expect(page.getByRole('button', { name: subject, exact: true })).toBeVisible();
  const after = await (await page.request.get('/api/outbox')).json();
  const delivered = after.items.filter((item: { event_id: string }) => item.event_id === receipt.event.id);
  expect(delivered).toHaveLength(1);
  expect(delivered[0].mode).toBe('test');
  expect(delivered[0].subject).toBe(subject);
  await page.reload();
  await expect(page.getByRole('button', { name: subject, exact: true })).toBeVisible();
});

test('public intake can submit without disclosing admin workspace', async ({ page }) => {
  await page.goto('/intake');
  await expect(page.getByRole('heading').first()).toBeVisible();
  const metadata = await (await page.request.get('/api/public/form')).json();
  expect(metadata.enabled).toBe(true);
  const response = await page.request.get('/api/settings');
  expect(response.status()).toBe(401);
  await expect(page.getByRole('button', { name: /提交|Submit/ }).first()).toBeVisible();
});

test('English console renders and settings never return stored secrets', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lead inbox', exact: true })).toBeVisible();
  await page.goto('/#settings');
  const settings = await (await page.request.get('/api/settings')).json();
  for (const key of ['llm_api_key', 'smtp_password', 'webhook_key', 'internal_key', 'session_secret']) {
    expect(settings).not.toHaveProperty(key);
  }
  await expect(page.getByText('AI business understanding', { exact: true }).first()).toBeVisible();
});
