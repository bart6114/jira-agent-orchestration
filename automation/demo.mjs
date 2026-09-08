// Maintainer-only demo preparation. Never called by a ticket's coding agent.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Jira } from './jira.mjs';
import { adf } from './core.mjs';
const jira = new Jira();
const project = process.env.JIRA_PROJECT_KEY;
if (!/^[A-Z][A-Z0-9_]*$/.test(project || '')) throw new Error('Invalid demo project.');
const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url)));
const tickets = JSON.parse(readFileSync(new URL('./demo-tickets.json', import.meta.url)));
mkdirSync('.run', { recursive: true });
async function inventory() {
  const issues = []; let nextPageToken;
  do {
    const page = await jira.request('/search/jql', 'POST', { jql: `project = ${project} ORDER BY key ASC`, fields: ['summary','description','status','labels'], maxResults: 100, ...(nextPageToken ? { nextPageToken } : {}) });
    issues.push(...page.issues); nextPageToken = page.nextPageToken;
  } while (nextPageToken);
  return issues;
}
const mode = process.argv[2];
if (mode === 'snapshot') {
  const issues = await inventory();
  for (const issue of issues) issue.comments = await jira.all(`/issue/${issue.key}/comment`, 'comments');
  writeFileSync('.run/demo-before.json', JSON.stringify({ project, issues }, null, 2));
  console.log(`Saved ${issues.length} issues before demo preparation.`);
} else if (mode === 'seed') {
  const before = JSON.parse(readFileSync('.run/demo-before.json'));
  if (before.project !== project) throw new Error('Snapshot belongs to another project.');
  if (process.env.RESET_PROJECT === 'true') {
    if (process.env.CONFIRM_PROJECT !== project) throw new Error('Reset requires the exact project key.');
    const current = await inventory();
    if (JSON.stringify(current) !== JSON.stringify(before.issues.map(({ comments, ...issue }) => issue))) throw new Error('Project changed since snapshot; reset stopped.');
    for (const issue of current) {
      if (!issue.key.startsWith(`${project}-`)) throw new Error('Cross-project deletion refused.');
      await jira.request(`/issue/${issue.key}`, 'DELETE');
      console.log(`Deleted ${issue.key}`);
    }
  }
  const metadata = await jira.request(`/project/${project}`);
  const type = metadata.issueTypes.find(t => t.name === 'Task' && !t.subtask);
  if (!type) throw new Error('Demo project must have a Task work type.');
  const existing = await inventory(); const result = [];
  // Fixture identity is bookkeeping, separate from labels and signed agent state.
  const propertyKey = 'agent-demo-fixture';
  for (const issue of existing) {
    const property = await jira.request(`/issue/${issue.key}/properties/${propertyKey}`, 'GET', undefined, true);
    issue.demoId = property?.value?.id;
  }
  for (const ticket of tickets) {
    const label = `demo-${ticket.id}`;
    const matches = existing.filter(i => i.demoId === ticket.id || (!i.demoId && i.fields.labels?.includes(label)));
    if (matches.length > 1) throw new Error(`Multiple tickets match demo fixture ${ticket.id}; resolve duplicates before seeding.`);
    let issue = matches[0];
    if (!issue) {
      issue = await jira.request('/issue', 'POST', { fields: { project: { key: project }, issuetype: { id: type.id }, summary: ticket.summary, description: adf(ticket.description) }, properties: [{ key: propertyKey, value: { id: ticket.id } }] });
      await jira.transition(issue.key, config.statuses.backlog);
    } else {
      // Persist identity before removing the legacy label so retries still find the ticket.
      if (issue.demoId !== ticket.id) await jira.request(`/issue/${issue.key}/properties/${propertyKey}`, 'PUT', { id: ticket.id });
      if (issue.fields.labels?.includes(label)) await jira.setLabel(issue.key, label, false);
    }
    result.push({ key: issue.key, role: ticket.demoRole, summary: ticket.summary });
  }
  writeFileSync('.run/demo-tickets.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} else throw new Error('Usage: node automation/demo.mjs snapshot|seed');
