import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const cli = resolve('automation/cli.mjs');
function workspace(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'jira-agent-test-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, '.run')); mkdirSync(join(cwd, 'src'));
  execFileSync('git', ['init', '-q'], { cwd });
  return cwd;
}
const apply = cwd => spawnSync(process.execPath, [cli, 'apply'], { cwd, encoding: 'utf8', env: { ...process.env, RUN_DIR: join(cwd, '.run') } });
const newFile = path => `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1 @@\n+export const count = 1;\n`;

test('the real patch consumer applies a new application file', t => {
  const cwd = workspace(t);
  writeFileSync(join(cwd, '.run/changes.patch'), newFile('src/count.ts'));
  const result = apply(cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(cwd, 'src/count.ts'), 'utf8'), 'export const count = 1;\n');
});

test('the real patch consumer rejects policy files and symlinks before writing', t => {
  const cwd = workspace(t);
  writeFileSync(join(cwd, '.run/changes.patch'), newFile('.github/workflows/escape.yml'));
  assert.notEqual(apply(cwd).status, 0);
  assert.equal(existsSync(join(cwd, '.github')), false);
  writeFileSync(join(cwd, '.run/changes.patch'), newFile('src/link').replace('100644', '120000'));
  assert.notEqual(apply(cwd).status, 0);
  assert.equal(existsSync(join(cwd, 'src/link')), false);
});

test('direct CLI invocation scopes credentials and treats ticket text as stdin data', t => {
  const cwd = workspace(t);
  const bin = join(cwd, 'bin'); mkdirSync(bin);
  const fake = join(bin, 'codex');
  // Fake process exercises the actual wrapper without invoking a model or using real credentials.
  writeFileSync(fake, `#!/usr/bin/env node
const fs = require('node:fs');
if (!fs.statSync(process.env.CODEX_HOME).isDirectory()) process.exit(1);
process.stderr.write('diagnostic ' + process.env.CODEX_API_KEY);
const args = process.argv.slice(2);
const out = args[args.indexOf('--output-last-message') + 1];
fs.writeFileSync(out + '.invocation', JSON.stringify({args, env: process.env, stdin: fs.readFileSync(0, 'utf8')}));
fs.writeFileSync(out, JSON.stringify({kind:'questions',body:'Which grouping behavior do you want?'}));
`);
  chmodSync(fake, 0o755);
  const runDir = join(cwd, '.run');
  writeFileSync(join(runDir, 'context.json'), JSON.stringify({ action: 'plan', context: { summary: '$(touch should-not-exist)' } }));
  const result = spawnSync(process.execPath, [cli, 'agent'], { cwd: resolve('.'), encoding: 'utf8', env: {
    ...process.env, RUN_DIR: runDir, CODEX_HOME: join(cwd, 'new-codex-home'), PATH: `${bin}:${process.env.PATH}`, OPENAI_API_KEY: 'fake-model-key',
    GH_TOKEN: 'fake-github-key', JIRA_API_TOKEN: 'fake-jira-key', STATE_SIGNING_KEY: 'fake-signing-key'
  } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(runDir, 'stderr.log'), 'utf8'), 'diagnostic [REDACTED]');
  const invocation = JSON.parse(readFileSync(join(runDir, 'result.json.invocation')));
  assert.equal(invocation.env.CODEX_API_KEY, 'fake-model-key');
  for (const name of ['OPENAI_API_KEY', 'GH_TOKEN', 'JIRA_API_TOKEN', 'STATE_SIGNING_KEY']) assert.equal(invocation.env[name], undefined);
  assert.equal(invocation.args.at(-1), '-');
  assert.equal(invocation.args[invocation.args.indexOf('--sandbox') + 1], 'read-only');
  assert.ok(invocation.stdin.includes('$(touch should-not-exist)'));
  assert.ok(invocation.args.includes('shell_environment_policy.exclude=["CODEX_API_KEY","OPENAI_API_KEY"]'));
});
