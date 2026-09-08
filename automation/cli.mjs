import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Jira } from './jira.mjs';
import { hash, plain, isBot, contextOf, decision, validateResult, checkPaths } from './core.mjs';
const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url)));
const dir = resolve(process.env.RUN_DIR || '.run'); mkdirSync(dir, { recursive: true });
const read = name => JSON.parse(readFileSync(`${dir}/${name}.json`, 'utf8'));
const write = (name, value) => writeFileSync(`${dir}/${name}.json`, JSON.stringify(value, null, 2));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const output = (key, value) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`); else console.log(`${key}=${value}`); };
const repo = () => {
  const value = process.env.GITHUB_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value || '')) throw new Error('Set GITHUB_REPOSITORY=owner/repo.');
  return value;
};
const issueKey = () => {
  const key = process.env.ISSUE_KEY; const project = process.env.JIRA_PROJECT_KEY;
  if (!/^[A-Z][A-Z0-9_]*$/.test(project || '') || !new RegExp(`^${project}-[1-9][0-9]*$`).test(key || '')) throw new Error('Invalid issue key or project; refusing cross-project request.');
  return key;
};
const runUrl = () => process.env.GITHUB_RUN_ID ? `https://github.com/${repo()}/actions/runs/${process.env.GITHUB_RUN_ID}` : 'Local execution';
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();
function applyPatch() {
  const patch = `${dir}/changes.patch`;
  if (!existsSync(patch)) throw new Error('Missing changes.patch.');
  const content = readFileSync(patch, 'utf8');
  if (content.length > 1000000 || /(?:old|new|new file|deleted file) mode 120000/.test(content)) throw new Error('Oversized or symbolic-link patch rejected.');
  const stats = execFileSync('git', ['apply','--numstat','-z',patch], { encoding: 'utf8' });
  checkPaths(stats.split('\0').filter(Boolean).map(line => line.split('\t').slice(2).join('\t')), config.allowedPaths);
  git('apply','--check',patch); git('apply',patch);
}
async function prepare() {
  const key = issueKey(); const jira = new Jira();
  // Per-issue serialization means a new run can clear a label left by a forced stop.
  await jira.setLabel(key, config.busyLabel, false);
  const snap = await jira.snapshot(key);
  const context = contextOf(snap.issue, snap.comments, jira.key); const contextHash = hash(context); const base = git('rev-parse','HEAD');
  const planComment = snap.comments.find(c => c.id === snap.state.commentId);
  const planIntact = !snap.state.plan || (planComment && isBot(plain(planComment.body), jira.key) && hash(plain(planComment.body)) === snap.state.commentHash);
  const action = decision({ state: snap.state, contextHash, base, status: snap.issue.fields.status.name, statuses: config.statuses, histories: snap.histories, approvers: (process.env.JIRA_APPROVER_IDS || '').split(',').map(s => s.trim()), planIntact });
  if (action.action === 'restore') {
    await jira.transition(key, action.status);
    const { pendingTransition, ...settled } = snap.state;
    await jira.save(key, settled); output('action','skip'); return;
  }
  if (action.action === 'reject') {
    await jira.comment(key, action.reason); await jira.transition(key, config.statuses.plan); output('action','skip'); return;
  }
  if (action.action === 'skip') {
    // Recover a published PR whose final Jira transition/comment failed.
    if (snap.state.pr && snap.issue.fields.status.name !== config.statuses.backlog) {
      await jira.comment(key, snap.state.completionBody);
      // Recovery must not undo a person's active review or completed work.
      if (![config.statuses.waitingReview, config.statuses.review, config.statuses.done].includes(snap.issue.fields.status.name)) {
        await jira.transition(key, config.statuses.waitingReview);
      }
    }
    output('action','skip'); return;
  }
  if (action.action === 'implement') {
    await jira.save(key, { ...snap.state, approvalId: action.approvalId });
    await jira.transition(key, config.statuses.implementing);
    await jira.setLabel(key, config.busyLabel, true);
  } else if ([config.statuses.approved, config.statuses.implementing].includes(snap.issue.fields.status.name)) {
    await jira.comment(key, 'Requirements, repository base, or plan changed. Preparing a fresh plan; please approve it again.');
    await jira.transition(key, config.statuses.selected);
  }
  const workStatus = action.action === 'implement' ? config.statuses.implementing : [config.statuses.approved, config.statuses.implementing].includes(snap.issue.fields.status.name) ? config.statuses.selected : snap.issue.fields.status.name;
  write('context', { key, context, contextHash, base, workStatus, action: action.action, plan: action.action === 'implement' ? snap.state.plan : null, planId: snap.state.planId, approvalId: action.approvalId, runUrl: runUrl() });
  output('action',action.action); output('base',base);
}
function agent() {
  const context = read('context');
  const args = ['exec','--ignore-user-config','--ephemeral','--sandbox',context.action === 'plan' ? 'read-only' : 'workspace-write','-c','approval_policy="never"','-c','shell_environment_policy.exclude=["CODEX_API_KEY","OPENAI_API_KEY"]','--output-schema',resolve(`automation/schemas/${context.action}.json`),'--output-last-message',`${dir}/result.json`,'--json'];
  if (process.env.CODEX_MODEL) args.push('--model', process.env.CODEX_MODEL);
  args.push('-');
  const prompt = readFileSync(`automation/prompts/${context.action}.md`, 'utf8') + '\nJira context and approved plan:\n' + JSON.stringify(context);
  // Deliberate environment allowlist: never inherit GH/Jira/state-signing credentials.
  const env = Object.fromEntries(['PATH','HOME','TMPDIR','CODEX_HOME'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for the live example.');
  env.CODEX_API_KEY = process.env.OPENAI_API_KEY;
  if (env.CODEX_HOME) mkdirSync(env.CODEX_HOME, { recursive: true, mode: 0o700 });
  const result = spawnSync('codex', args, { input: prompt, encoding: 'utf8', env, timeout: 20 * 60000, maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(`${dir}/events.jsonl`, result.stdout || '');
  writeFileSync(`${dir}/stderr.log`, (result.stderr || '').split(env.CODEX_API_KEY).join('[REDACTED]'));
  if (result.status !== 0) throw new Error(`Codex failed (exit ${result.status}); inspect private run logs. ${result.error?.message || ''}`);
  const response = validateResult(read('result'), context.action);
  if (context.action === 'implement' && response.outcome !== 'implemented') throw new Error(`Implementation blocked: ${response.summary}`);
  if (context.action === 'implement') {
    git('add','-A');
    checkPaths(git('diff','--cached','--name-only','-z').split('\0').filter(Boolean), config.allowedPaths);
    writeFileSync(`${dir}/changes.patch`, execFileSync('git',['diff','--cached','--binary','--full-index','HEAD']));
  }
}
async function publish() {
  const input = read('context'); const key = issueKey();
  if (input.key !== key) throw new Error('Context issue does not match workflow issue.');
  const result = validateResult(read('result'), input.action);
  if (input.action === 'implement' && result.outcome !== 'implemented') throw new Error('Agent reported a blocked implementation.');
  const jira = new Jira(); const snap = await jira.snapshot(key);
  if (snap.issue.fields.status.name !== input.workStatus) throw new Error('Ticket status changed during execution; publication stopped.');
  if (hash(contextOf(snap.issue, snap.comments, jira.key)) !== input.contextHash) throw new Error('Requirements changed during execution; retry to replan.');
  const main = process.env.DEFAULT_BRANCH || 'main';
  const current = gh('api',`repos/${repo()}/commits/${main}`,'--jq','.sha');
  if (current !== input.base) throw new Error('Default branch changed during execution; retry to replan.');
  if (input.action === 'plan') {
    const planId = hash({ body: result.body, base: input.base, context: input.contextHash }).slice(0,12);
    const body = `${result.kind === 'plan' ? 'Implementation plan' : 'Clarification needed'} · ${planId}\n\n${result.body}\n\nRun: ${input.runUrl}`;
    const comment = await jira.comment(key, body);
    const state = { contextHash: input.contextHash, base: input.base, plan: result.kind === 'plan' ? result.body : null, planId, commentId: comment.id, commentHash: hash(plain(comment.body)), publishedAt: comment.created };
    const target = result.kind === 'plan' ? config.statuses.plan : config.statuses.questions;
    await jira.save(key, { ...state, pendingTransition: { from: snap.issue.fields.status.name, to: target } });
    await jira.transition(key, target);
    await jira.save(key, state);
    return;
  }
  if (snap.state.approvalId !== input.approvalId || snap.state.planId !== input.planId || snap.issue.fields.status.name !== config.statuses.implementing) throw new Error('Approval was changed or implementation was stopped.');
  const pc = snap.comments.find(c => c.id === snap.state.commentId);
  if (!pc || hash(plain(pc.body)) !== snap.state.commentHash) throw new Error('Approved plan comment changed.');
  const branch = `codex/${key}`;
  const prs = JSON.parse(gh('pr','list','--repo',repo(),'--head',branch,'--state','all','--json','url,state'));
  let pr = prs[0]?.url;
  if (prs[0] && prs[0].state !== 'OPEN') throw new Error('Existing PR is closed or merged; create a follow-up ticket.');
  if (!pr) {
    applyPatch(); git('checkout','-b',branch);
    git('add','--','src','tests'); git('-c','user.name=github-actions[bot]','-c','user.email=41898282+github-actions[bot]@users.noreply.github.com','commit','-m',`${key}: implement approved plan ${input.planId}`);
    // No force push. A retry after a successful push reuses the matching remote branch.
    const remote = git('ls-remote','--heads','origin',branch);
    if (!remote) git('push','origin',branch);
    else {
      git('fetch','origin',branch);
      if (git('rev-parse','HEAD^{tree}') !== git('rev-parse','FETCH_HEAD^{tree}')) throw new Error('Existing branch differs from this result; inspect before retrying.');
    }
    writeFileSync(`${dir}/pr.md`, `${result.summary}\n\nJira: ${jira.url}/browse/${key}\nApproved plan: ${input.planId}\n\nValidation: npm run check passed in a separate job.\nWorkflow: ${input.runUrl}\n`);
    pr = gh('pr','create','--repo',repo(),'--head',branch,'--base',main,'--title',`${key}: ${input.context.summary}`,'--body-file',`${dir}/pr.md`);
  }
  const body = `Implementation finished. Ready for human review.\nBranch: https://github.com/${repo()}/tree/${branch}\nPull request: ${pr}\nChecks: typecheck, tests and build passed.\nRun: ${input.runUrl}`;
  await jira.save(key, { ...snap.state, pr, branch, completionBody: body });
  await jira.comment(key, body); await jira.transition(key, config.statuses.waitingReview);
  await jira.setLabel(key, config.busyLabel, false);
}
async function reconcile() {
  const jira = new Jira(); const project = process.env.JIRA_PROJECT_KEY;
  if (!/^[A-Z][A-Z0-9_]*$/.test(project || '')) throw new Error('Invalid project.');
  let nextPageToken;
  do {
    const active = Object.entries(config.statuses).filter(([key]) => !['backlog','done'].includes(key)).map(([,name]) => JSON.stringify(name)).join(', ');
    const page = await jira.request('/search/jql','POST',{ jql: `project = ${project} AND status IN (${active}) ORDER BY created ASC`, fields: ['key'], maxResults: 100, ...(nextPageToken ? { nextPageToken } : {}) });
    for (const issue of page.issues) gh('workflow','run','jira-agent.yml','--repo',repo(),'--ref',process.env.DEFAULT_BRANCH || 'main','-f',`issue_key=${issue.key}`);
    nextPageToken = page.nextPageToken;
  } while (nextPageToken);
}
async function doctor() {
  const names = ['JIRA_BASE_URL','JIRA_PROJECT_KEY','JIRA_EMAIL','JIRA_API_TOKEN','JIRA_APPROVER_IDS','STATE_SIGNING_KEY','OPENAI_API_KEY'];
  for (const name of names) console.log(`${name}: ${process.env[name] ? 'configured' : 'missing'}`);
  if (names.some(name => !process.env[name])) { process.exitCode = 1; return; }
  const jira = new Jira(); await jira.request('/myself'); await jira.request(`/project/${process.env.JIRA_PROJECT_KEY}`);
  console.log('Jira authentication and project access verified.');
}
const commands = { prepare, agent, publish, reconcile, doctor, apply: applyPatch,
  cleanup: async () => { await new Jira().setLabel(issueKey(), config.busyLabel, false); },
  failure: async () => { const jira = new Jira(); await jira.comment(issueKey(), `Automation did not complete. Inspect the failed job and use Run workflow to retry this ticket. No review-ready result is claimed.\nRun: ${runUrl()}`); }
};
try { const fn = commands[process.argv[2]]; if (!fn) throw new Error('Usage: node automation/cli.mjs prepare|agent|apply|publish|failure|cleanup|reconcile|doctor'); await fn(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
