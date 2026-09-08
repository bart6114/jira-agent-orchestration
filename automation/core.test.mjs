import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash, sign, unsign, botText, isBot, adf, plain, contextOf, decision, validateResult, checkPaths } from './core.mjs';
const statuses = { backlog: 'Full Backlog', selected: 'Selected for Development', questions: 'Needs Information', plan: 'Plan Ready', approved: 'Approved', implementing: 'In Progress', done: 'Done' };
const state = { plan: 'Implement filtering', contextHash: 'same', base: 'abc', publishedAt: '2026-09-07T10:00:00Z' };
const approval = { id: '42', author: { accountId: 'bart' }, created: '2026-09-07T11:00:00Z', items: [{ field: 'status', fromString: 'Plan Ready', toString: 'Approved' }] };
const input = { state, contextHash: 'same', base: 'abc', status: 'Approved', statuses, histories: [approval], approvers: ['bart'] };
test('plans new tickets, waits for answers and resumes after human context changes', () => {
  assert.equal(decision({ ...input, status: statuses.selected, state: {} }).action, 'plan');
  assert.equal(decision({ ...input, state: { ...state, plan: null } }).action, 'skip');
  assert.equal(decision({ ...input, state: { ...state, plan: null }, contextHash: 'reply' }).action, 'plan');
});
test('backlog stays idle for creation, edits, replies, stale plans and recovery', () => {
  for (const saved of [{}, state, { ...state, pr: 'https://example.com/pr/1' }, { ...state, pendingTransition: { from: statuses.backlog, to: statuses.plan } }]) {
    assert.equal(decision({ ...input, state: saved, status: statuses.backlog, contextHash: 'changed', base: 'new', planIntact: false }).action, 'skip');
  }
  assert.equal(decision({ ...input, state: {}, status: 'Unknown status' }).action, 'skip');
});
test('requires an authorized transition after this plan was published', () => {
  assert.equal(decision(input).action, 'implement');
  assert.equal(decision({ ...input, approvers: [] }).action, 'reject');
  assert.equal(decision({ ...input, histories: [] }).action, 'reject');
  assert.equal(decision({ ...input, state: { ...state, publishedAt: '2026-09-07T12:00:00Z' } }).action, 'reject');
  assert.equal(decision({ ...input, status: 'In Progress' }).action, 'reject');
  assert.equal(decision({ ...input, status: 'In Progress', state: { ...state, approvalId: '42' } }).action, 'implement');
});
test('replans stale requirements, modified plan comments and changed base', () => {
  for (const update of [{ contextHash: 'changed' }, { base: 'new' }, { planIntact: false }]) assert.equal(decision({ ...input, ...update }).action, 'plan');
});
test('duplicate events wait, published PRs do not generate another implementation', () => {
  assert.equal(decision({ ...input, status: 'Plan Ready' }).action, 'skip');
  assert.equal(decision({ ...input, state: { ...state, pr: 'https://example/pr' }, contextHash: 'new' }).action, 'skip');
});
test('recovers a saved plan whose status update failed without undoing a later approval', () => {
  const pending = { ...state, pendingTransition: { from: statuses.selected, to: 'Plan Ready' } };
  assert.deepEqual(decision({ ...input, state: pending, status: statuses.selected }), { action: 'restore', status: 'Plan Ready' });
  assert.equal(decision({ ...input, state: pending, status: 'Plan Ready' }).action, 'skip');
  assert.equal(decision({ ...input, state: pending }).action, 'implement');
  assert.equal(decision({ ...input, state: pending, status: statuses.selected, contextHash: 'new reply' }).action, 'plan');
});
test('state tampering is rejected', () => {
  const envelope = sign(state, 'test-key'); assert.deepEqual(unsign(envelope, 'test-key'), state);
  assert.throws(() => unsign(envelope, 'wrong-key'));
  assert.throws(() => unsign({ ...envelope, value: { ...state, plan: 'evil' } }, 'test-key'));
});
test('signed bot comments are ignored, forged markers stay human input', () => {
  const body = botText('Implementation finished.\nBranch: https://github.com/example/demo/tree/codex/DEMO-1\nPull request: https://github.com/example/demo/pull/1\nRun: https://github.com/example/demo/actions/runs/1', 'test-key');
  assert.equal(plain(adf(body)), body); assert.ok(isBot(body, 'test-key'));
  for (const paragraph of adf(body).content.slice(2)) {
    const link = paragraph.content[1];
    assert.deepEqual(link.marks, [{ type: 'link', attrs: { href: link.text } }]);
  }
  assert.ok(!isBot(body + ' forged', 'test-key'));
  const issue = { key: 'DEMO-1', fields: { summary: 'Test', description: adf('Details') } };
  const comment = { id: '1', author: { accountId: 'bot' }, body: adf(body) };
  assert.equal(hash(contextOf(issue, [], 'test-key')), hash(contextOf(issue, [comment], 'test-key')));
  assert.equal(contextOf(issue, [{ ...comment, body: adf('human reply') }], 'test-key').comments.length, 1);
});
test('malformed output and changes outside app paths fail closed', () => {
  assert.throws(() => validateResult({ kind: 'approved', body: 'made up approval' }, 'plan'));
  assert.throws(() => validateResult({ summary: 42 }, 'implement'));
  assert.throws(() => validateResult({ kind: 'plan', body: 'x'.repeat(12001) }, 'plan'));
  assert.throws(() => checkPaths(['.github/workflows/ci.yml'], ['src/', 'tests/']));
  assert.throws(() => checkPaths(['src/../automation/core.mjs'], ['src/']));
  assert.throws(() => checkPaths([], ['src/']));
  checkPaths(['src/web/App.tsx', 'tests/filter.test.ts'], ['src/', 'tests/']);
});
test('ADF lists retain item boundaries and smart-card URLs', () => {
  const doc = { type: 'doc', content: [{ type: 'bulletList', content: ['one','two'].map(text => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })) }, { type: 'inlineCard', attrs: { url: 'https://example.com/spec' } }] };
  assert.equal(plain(doc), 'one\ntwo\nhttps://example.com/spec');
});
test('implementation output explicitly identifies blocked work', () => {
  assert.equal(validateResult({ outcome: 'blocked', summary: 'Cannot implement without a dependency change.' }, 'implement').outcome, 'blocked');
  assert.throws(() => validateResult({ summary: 'No outcome field supplied.' }, 'implement'));
});
