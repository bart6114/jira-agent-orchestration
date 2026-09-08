import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const mac = (value, key) => createHmac('sha256', key).update(JSON.stringify(value)).digest('hex');
export function sign(value, key) { return { value, signature: mac(value, key) }; }
export function unsign(envelope, key) {
  if (!envelope) return {};
  const expected = Buffer.from(mac(envelope.value, key));
  const actual = Buffer.from(envelope.signature || '');
  if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) throw new Error('Invalid orchestration state signature; do not trust edited Jira properties.');
  return envelope.value;
}
export function plain(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (['inlineCard', 'blockCard'].includes(node.type)) return node.attrs?.url || '';
  return (node.text || '') + (node.content || []).map(plain).join(['doc','bulletList','orderedList','listItem','table','tableRow'].includes(node.type) ? '\n' : '') + (node.type === 'hardBreak' ? '\n' : '');
}
export function adf(text) {
  return { version: 1, type: 'doc', content: text.split('\n').map(line => {
    const link = /^(Branch: |Pull request: |Run: )(https:\/\/\S+)$/.exec(line);
    const content = link
      ? [{ type: 'text', text: link[1] }, { type: 'text', text: link[2], marks: [{ type: 'link', attrs: { href: link[2] } }] }]
      : line ? [{ type: 'text', text: line }] : [];
    return { type: 'paragraph', content };
  }) };
}
export function botText(body, key) { return `[agent-demo:${mac(body, key)}]\n${body}`; }
export function isBot(text, key) {
  const match = /^\[agent-demo:([a-f0-9]{64})\]\n([\s\S]*)$/.exec(text);
  return Boolean(match && match[1] === mac(match[2], key));
}
export function contextOf(issue, comments, key) {
  return { key: issue.key, summary: issue.fields.summary, description: plain(issue.fields.description), comments: comments.filter(c => !isBot(plain(c.body), key)).map(c => ({ id: c.id, author: c.author.accountId, body: plain(c.body), updated: c.updated })) };
}
export function decision({ state, contextHash, base, status, statuses, histories, approvers, planIntact = true }) {
  if (status === statuses.backlog) return { action: 'skip', reason: 'Not selected for development.' };
  if (state.pr || status === statuses.done) return { action: 'skip', reason: 'Already published or done.' };
  if (![statuses.selected, statuses.questions, statuses.plan, statuses.approved, statuses.implementing].includes(status)) return { action: 'skip', reason: 'Outside the agent workflow.' };
  if (state.contextHash !== contextHash || !planIntact || (state.base && state.base !== base)) return { action: 'plan' };
  if (state.pendingTransition?.from === status && status !== state.pendingTransition.to) return { action: 'restore', status: state.pendingTransition.to };
  if (!state.plan) return { action: 'skip', reason: 'Waiting for a human answer.' };
  if (![statuses.approved, statuses.implementing].includes(status)) return { action: 'skip', reason: 'Waiting for approval.' };
  const transition = [...histories].reverse().find(h => h.items.some(i => i.field === 'status' && i.toString === statuses.approved));
  if (!transition || !approvers.includes(transition.author.accountId) || Date.parse(transition.created) <= Date.parse(state.publishedAt) || !transition.items.some(i => i.field === 'status' && i.fromString === statuses.plan)) return { action: 'reject', reason: 'Move the current plan from Plan Ready to Approved using an allowed approver account.' };
  if (status === statuses.implementing && state.approvalId !== transition.id) return { action: 'reject', reason: 'No recorded approval for this implementation.' };
  return { action: 'implement', approvalId: transition.id };
}
export function validateResult(value, phase) {
  if (!value || typeof value !== 'object') throw new Error('Agent output must be JSON.');
  if (phase === 'plan') {
    if (!['questions','plan'].includes(value.kind) || typeof value.body !== 'string' || value.body.trim().length < 10 || value.body.length > 12000) throw new Error('Invalid planning output.');
  } else if (!['implemented','blocked'].includes(value.outcome) || typeof value.summary !== 'string' || value.summary.length < 5 || value.summary.length > 8000) throw new Error('Invalid implementation output.');
  return value;
}
export function checkPaths(paths, allowed) {
  if (!paths.length) throw new Error('Agent produced no code changes.');
  for (const path of paths) if (!allowed.some(prefix => path.startsWith(prefix)) || path.split('/').some(p => p === '..' || p === '.git')) throw new Error(`Change outside allowed application paths: ${path}`);
}
