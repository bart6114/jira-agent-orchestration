import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Jira } from './jira.mjs';
import { adf, botText, sign } from './core.mjs';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const client = (extra = {}) => new Jira({ JIRA_BASE_URL: 'https://fixture.atlassian.net', JIRA_EMAIL: 'fixture@example.com', JIRA_API_TOKEN: 'fixture-only', STATE_SIGNING_KEY: 'fixture-key', ...extra });
const json = value => new Response(JSON.stringify(value), { status: 200 });
test('routes scoped tokens through the API gateway while preserving Jira ticket links', async () => {
  const cloudId = '11111111-2222-3333-4444-555555555555'; const urls = [];
  globalThis.fetch = async (url, options) => { urls.push(url); assert.match(options.headers.Authorization, /^Basic /); return json({}); };
  const scoped = client({ JIRA_CLOUD_ID: cloudId });
  await scoped.request('/myself'); await client().request('/myself');
  assert.deepEqual(urls, [`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/myself`, 'https://fixture.atlassian.net/rest/api/3/myself']);
  assert.equal(scoped.url, 'https://fixture.atlassian.net');
});
test('rejects a cloud ID containing URL or path components', () => {
  assert.throws(() => client({ JIRA_CLOUD_ID: '../other-tenant' }), /UUID/);
});
test('handles Jira property writes with empty 201 responses', async () => {
  let calls = 0;
  globalThis.fetch = async (_url, options) => { calls++; assert.equal(options.method, 'PUT'); assert.equal(JSON.parse(options.body).value.plan, 'plan'); return new Response(null, { status: 201 }); };
  await client().save('DEMO-1', { plan: 'plan' }); assert.equal(calls, 1);
});
test('a retry reuses an already posted completion comment', async () => {
  const body = 'Ready for review.\nPR: https://example.com/pr/1'; let posts = 0;
  globalThis.fetch = async (_url, options) => {
    if (options.method === 'POST') posts++;
    return json({ total: 1, comments: [{ id: '7', body: adf(botText(body, 'fixture-key')) }] });
  };
  assert.equal((await client().comment('DEMO-1', body)).id, '7'); assert.equal(posts, 0);
});
test('loads all Jira comment pages rather than truncating human context', async () => {
  globalThis.fetch = async url => String(url).includes('startAt=0') ? json({ total: 2, comments: [{ id: '1' }] }) : json({ total: 2, comments: [{ id: '2' }] });
  assert.deepEqual((await client().all('/issue/DEMO-1/comment', 'comments')).map(c => c.id), ['1','2']);
});
test('transport errors expose status, not credential or private response body', async () => {
  globalThis.fetch = async () => new Response('private server details', { status: 403 });
  await assert.rejects(client().request('/myself'), error => error.message.includes('403') && !error.message.includes('fixture-only') && !error.message.includes('private server details'));
});
test('POST failures are not automatically repeated', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 500 }); };
  await assert.rejects(client().request('/issue/DEMO-1/comment', 'POST', { body: adf('Test') })); assert.equal(calls, 1);
});
test('snapshot refuses forged persisted state', async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('/properties/')) return json({ value: sign({ plan: 'forged' }, 'wrong') });
    if (String(url).includes('/comment')) return json({ comments: [], total: 0 });
    if (String(url).includes('/changelog')) return json({ values: [], total: 0 });
    return json({ key: 'DEMO-1', fields: {} });
  };
  await assert.rejects(client().snapshot('DEMO-1'), /signature/);
});
test('busy label updates preserve human labels and repeated cleanup is harmless', async () => {
  const labels = new Set(['customer-request']); const updates = [];
  globalThis.fetch = async (url, options) => {
    if (options.method === 'GET') {
      assert.match(String(url), /\/issue\/DEMO-1\?fields=labels$/);
      return json({ fields: { labels: [...labels] } });
    }
    assert.equal(options.method, 'PUT');
    const body = JSON.parse(options.body); updates.push(body);
    assert.equal(body.fields, undefined);
    for (const operation of body.update.labels) {
      if (operation.add) labels.add(operation.add);
      if (operation.remove) labels.delete(operation.remove);
    }
    return new Response(null, { status: 204 });
  };
  const jira = client();
  await jira.setLabel('DEMO-1', 'implementation-busy', true);
  await jira.setLabel('DEMO-1', 'implementation-busy', true);
  assert.deepEqual([...labels], ['customer-request', 'implementation-busy']);
  labels.add('human-added-during-run');
  await jira.setLabel('DEMO-1', 'implementation-busy', false);
  await jira.setLabel('DEMO-1', 'implementation-busy', false);
  assert.deepEqual([...labels], ['customer-request', 'human-added-during-run']);
  assert.deepEqual(updates, [
    { update: { labels: [{ add: 'implementation-busy' }] } },
    { update: { labels: [{ remove: 'implementation-busy' }] } }
  ]);
});
