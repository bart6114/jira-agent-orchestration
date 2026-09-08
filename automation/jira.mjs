import { adf, botText, plain, sign, unsign } from './core.mjs';
export class Jira {
  constructor(env = process.env) {
    this.url = env.JIRA_BASE_URL?.replace(/\/$/, ''); this.key = env.STATE_SIGNING_KEY;
    if (!this.url?.startsWith('https://') || !env.JIRA_EMAIL || !env.JIRA_API_TOKEN || !this.key) throw new Error('Missing Jira credentials or STATE_SIGNING_KEY. Run npm run automation:doctor.');
    const cloudId = env.JIRA_CLOUD_ID;
    if (cloudId && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(cloudId)) throw new Error('JIRA_CLOUD_ID must be a UUID.');
    // Scoped tokens use Atlassian's gateway; this.url remains the human-facing site URL.
    this.apiUrl = cloudId ? `https://api.atlassian.com/ex/jira/${cloudId}` : this.url;
    this.auth = 'Basic ' + Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString('base64');
  }
  async request(path, method = 'GET', body, missing = false) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(`${this.apiUrl}/rest/api/3${path}`, { method, headers: { Authorization: this.auth, Accept: 'application/json', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000), redirect: 'error' });
      if (missing && res.status === 404) return null;
      // Retry reads and idempotent property writes only. Never blindly repeat a comment POST.
      if ((res.status === 429 || res.status >= 500) && ['GET','PUT'].includes(method) && attempt < 3) { await new Promise(r => setTimeout(r, Math.min(10000, Number(res.headers.get('retry-after') || 2 ** attempt) * 1000))); continue; }
      if (!res.ok) throw new Error(`Jira ${method} ${path.split('?')[0]} returned ${res.status}. Check permissions and audit logs.`);
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    }
  }
  async all(path, field) {
    const values = []; let start = 0;
    while (true) {
      const page = await this.request(`${path}${path.includes('?') ? '&' : '?'}startAt=${start}&maxResults=100`);
      values.push(...page[field]); start += page[field].length;
      if (page.isLast || start >= page.total || !page[field].length) return values;
      if (values.length > 5000) throw new Error('Ticket exceeds demo context limit.');
    }
  }
  async snapshot(issueKey) {
    const [issue, comments, histories, property] = await Promise.all([
      this.request(`/issue/${issueKey}?fields=summary,description,status,project`),
      this.all(`/issue/${issueKey}/comment`, 'comments'),
      this.all(`/issue/${issueKey}/changelog`, 'values'),
      this.request(`/issue/${issueKey}/properties/agent-demo`, 'GET', undefined, true),
    ]);
    return { issue, comments, histories, state: unsign(property?.value, this.key) };
  }
  async save(key, state) {
    const envelope = sign(state, this.key);
    if (Buffer.byteLength(JSON.stringify(envelope)) > 30000) throw new Error('State exceeds Jira property size budget.');
    await this.request(`/issue/${key}/properties/agent-demo`, 'PUT', envelope);
  }
  async comment(key, body) {
    const text = botText(body, this.key);
    const comments = await this.all(`/issue/${key}/comment`, 'comments');
    const existing = comments.find(c => plain(c.body) === text);
    return existing || this.request(`/issue/${key}/comment`, 'POST', { body: adf(text) });
  }
  async setLabel(key, label, enabled) {
    const issue = await this.request(`/issue/${key}?fields=labels`);
    if ((issue.fields.labels || []).includes(label) === enabled) return;
    // Atomic field operation preserves unrelated labels, including concurrent human edits.
    await this.request(`/issue/${key}`, 'PUT', { update: { labels: [{ [enabled ? 'add' : 'remove']: label }] } });
  }
  async transition(key, name) {
    const issue = await this.request(`/issue/${key}?fields=status`);
    if (issue.fields.status.name === name) return;
    const data = await this.request(`/issue/${key}/transitions`);
    const target = data.transitions.find(t => t.to.name === name);
    if (!target) throw new Error(`No available transition to ${name}; check Jira workflow configuration.`);
    await this.request(`/issue/${key}/transitions`, 'POST', { transition: { id: target.id } });
  }
}
