# API credentials versus a subscription

Last source check: **2026-09-07**. The configured workflow uses a Codex API key; alternatives
below are documentation-verified recipes. Recheck vendor documentation before adoption.

## Codex API: the default

Create an OpenAI Platform project key and put it in the repository secret `OPENAI_API_KEY`.
The wrapper exposes it as `CODEX_API_KEY` only to `codex exec`. The key is not set at job scope,
not passed to installation steps, and excluded from Codex-launched shell environments.
The API project pays for these calls separately from a ChatGPT subscription.

The model process still needs its inference credential. Shell environment filtering is not a
security boundary against a compromised same-user process. Use a vetted credential proxy and
stronger process isolation if your threat model requires protecting that key from arbitrary
agent-executed code. The GitHub/Jira publishing credentials live in separate jobs.

[Codex authentication](https://learn.chatgpt.com/docs/auth) ·
[Non-interactive credential guidance](https://learn.chatgpt.com/docs/non-interactive-mode) ·
[Official action](https://learn.chatgpt.com/docs/github-action)

## Codex subscription: trusted private automation

Use this only when the user explicitly selects their ChatGPT-managed Codex identity.
Create a separate file-backed CLI login for the CI stream rather than copying a login cache
that a developer's active machine will keep refreshing.

- Persistent runner: keep its dedicated `CODEX_HOME` outside the checkout; seed credentials
  once and retain the file updated by Codex.
- Ephemeral runner: restore the current `auth.json` from secure storage, run the CLI, and
  persist the refreshed file in an always-run cleanup step. Merely restoring a fixed GitHub
  secret each time eventually loses refreshed credentials.
- Serialize **all** jobs sharing the auth cache, not just jobs for the same Jira ticket.
- Keep credentials out of Git, artifacts and logs. Renew through the supported login flow
  if the session can no longer refresh. Never implement your own refresh-token endpoint calls.

This requires adapting the API-only check in `automation/cli.mjs` and the workflow's credential
steps. A public repository must not enable this private-account pattern. Subscription allowances
and workspace controls still apply; no unlimited or guaranteed unattended access is implied.

[Official advanced CI recipe](https://learn.chatgpt.com/docs/auth/ci-cd-auth).
Enterprise users can also evaluate the [managed authentication options](https://learn.chatgpt.com/docs/auth)
linked from that documentation, including access tokens and workload identity where available.

## Claude Code API

Set `ANTHROPIC_API_KEY` for the CLI process. Invoke `claude -p` with explicit output schema
and tool controls, then normalize `structured_output` to the shared result format.
For API-only automation, current documentation recommends `--bare` to reduce implicit local
configuration; explicitly supply the trusted repository instructions when using it.
The API credential can take precedence over a subscription login, so select one mode explicitly.

[Programmatic execution](https://code.claude.com/docs/en/headless) ·
[Authentication precedence](https://code.claude.com/docs/en/authentication#authentication-precedence).

## Claude Code subscription

On a trusted machine run `claude setup-token`, complete the browser authorization, and save
its output directly into your CI secret manager as `CLAUDE_CODE_OAUTH_TOKEN`. The documented
route requires an eligible Pro, Max, Team or Enterprise plan and currently issues a one-year
token. Track its expiry and renew it before unattended jobs fail.

Run `claude -p` without `--bare`: bare mode does not read subscription credentials. Remove
conflicting API credentials from the process environment if subscription billing is intended.
Do not reuse this coding-CLI token as a general Anthropic REST API key.

[Official token setup and restrictions](https://code.claude.com/docs/en/authentication#generate-a-long-lived-token).

## Choosing a mode

For a small reproducible CI example, choose API authentication. For an organization requiring
subscription/workspace identity, verify eligibility, runner trust, storage, renewal and usage
limits against the linked official pages. Keep the same orchestration interfaces whichever
identity is selected. GitHub-hosted, self-hosted, Azure and Jenkins runners differ in secret
storage and persistence, not in what constitutes a valid Jira approval.
