# Setup

Follow the [illustrated Jira guide](jira-visual-guide.md) alongside these instructions for
English screenshots of the board, trigger fields, request body, headers and ticket controls.

## 1. Repository and local application

Use Node 22.13+, npm and Git. Install GitHub CLI for the GitHub publisher.
Run `npm ci`, `npm run check`, and `npm run demo:fixtures` before pushing the workflow to `main`.
The live agent version is pinned to Codex CLI 0.153.4; dependencies are locked.

## 2. Jira project

Create a team-managed Kanban project. In this demonstration its key is `CXD`; use your own key
when adopting. Configure these exact status names, or edit `automation/config.json`:

`Full Backlog`, `Selected for Development`, `Needs Information`, `Plan Ready`, `Approved`, `In Progress`, `Waiting for Review`, `In Review`, `Done`.

Make transitions used by automation available, including returning to Selected for Development or Plan Ready.
Keep Full Backlog as the initial status. Selection starts planning; approval starts coding.
This Kanban queue is not a time-boxed sprint. Moving active work back to Full Backlog stops
new agent work, and publication refuses a ticket whose status changed during execution.
Approval is the human transition **Plan Ready → Approved**, not a reaction or a text command.
The worker validates the author and timestamp from Jira's changelog. Use Jira account IDs,
not display names, for the approver allowlist. Discover IDs through the user/profile API or UI.

The Jira API identity needs project browsing, comment creation, issue editing/properties,
transitions and changelog access. Use a dedicated service account where your Jira plan supports
one. A personal account works for this private demo; signed markers distinguish bot comments
from the same person's human comments. Keep the token restricted to the intended setup.

For a scoped Jira token, select Jira and the classic scopes `read:jira-work`, `write:jira-work`,
and `read:jira-user`. These cover issue data, comments/properties/transitions and the identity
check. The classic write scope also permits issue deletion, although the ticket-processing worker never deletes
Jira issues. The separate, explicitly requested demo-reset workflow does delete issues. Scopes do not restrict a token to one project: the worker enforces its configured
project, and a dedicated account can further restrict access through Jira permissions.

Set `JIRA_CLOUD_ID` to your site's cloud UUID. Scoped tokens require
`https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/...`; the adapter selects this gateway
automatically. Keep `JIRA_BASE_URL` as `https://your-site.atlassian.net` for ticket links.
Without a cloud ID, the adapter retains the direct-site endpoint for unscoped tokens.
[Atlassian token setup and endpoint requirements](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/)
· [Scope definitions](https://developer.atlassian.com/cloud/jira/platform/scopes-for-oauth-2-3LO-and-forge-apps/).

## 3. Repository configuration

| Type | Name | Value |
| --- | --- | --- |
| Variable | `JIRA_BASE_URL` | `https://your-site.atlassian.net` |
| Variable | `JIRA_CLOUD_ID` | Site UUID; required for scoped Jira tokens |
| Variable | `JIRA_PROJECT_KEY` | Your project key |
| Variable | `JIRA_APPROVER_IDS` | Comma-separated Jira account IDs |
| Variable | `CODEX_MODEL` | Optional explicit model; otherwise pinned CLI default |
| Variable | `AUTOMATION_ENABLED` | `true` only after credential setup; enables scheduled reconciliation |
| Secret | `JIRA_EMAIL` | API identity email |
| Secret | `JIRA_API_TOKEN` | Jira token |
| Secret | `STATE_SIGNING_KEY` | Random 32+ byte signing secret |
| Secret | `OPENAI_API_KEY` | OpenAI Platform project key |

Set secrets through the GitHub settings UI or `gh secret set NAME` (stdin prompt). Do not
paste them into tickets, commits, CLI arguments in shared logs, or agent conversations.
For local verification use an untracked `.env` and `node --env-file=.env automation/cli.mjs doctor`.
The doctor prints presence only and checks Jira identity/project access; it makes no model call.

GitHub Settings → Actions → General must permit GitHub Actions to create pull requests.
The publisher requests contents-write and pull-requests-write; all other jobs have read-only
repository permissions. No job automatically approves or merges a PR.

## 4. Jira Automation → GitHub

Create a **fine-grained GitHub token scoped to this repository with Actions: write**.
Store it in Jira Automation's hidden Authorization header. Do not use a broad developer token.
Renew it when it expires. Keep access to editing the automation rules limited to trusted admins.

Create project-scoped rules with these triggers:

1. Work item transitioned: any status → Selected for Development. No creation rule.
2. Work item commented. Add a smart-values condition: `{{comment.body}}` **does not contain**
   `[agent-demo:`. This prevents bot output and failure reports from starting repeated runs.
   The worker separately verifies signatures when excluding bot comments from requirements.
3. Field value changed: Summary or Description.
   For both the comment and edit rules, add a JQL condition:
   `status in ("Selected for Development", "Needs Information", "Plan Ready", "Approved", "In Progress")`.
   This prevents backlog activity and post-PR conversations from dispatching model work.
4. Work item transitioned: Plan Ready → Approved.

For each rule add **Send web request**:

- URL: `https://api.github.com/repos/OWNER/REPO/actions/workflows/jira-agent.yml/dispatches`
- Method: POST; custom JSON body below.
- Headers: `Accept: application/vnd.github+json`, `Content-Type: application/json`,
  `Authorization: Bearer <repository-scoped token>` (hidden), `X-GitHub-Api-Version: 2026-03-10`.
- Wait for the web response; use the Jira audit log to verify a successful 2xx response.
- Keep rule chaining disabled. The worker's status/comment writes must not create another loop.

```json
{
  "ref": "main",
  "inputs": { "issue_key": "{{issue.key}}" }
}
```

No user-supplied summary, shell command, actor identity, or approval flag travels in the dispatch.
The worker fetches the authoritative issue. For a different default branch update the workflow's
ref guard, checkout, `DEFAULT_BRANCH`, and the Jira request together.

[GitHub dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event) ·
[Jira triggers](https://support.atlassian.com/cloud-automation/docs/jira-automation-triggers/) ·
[Jira actions](https://support.atlassian.com/cloud-automation/docs/jira-automation-actions/).

## 5. Verify

Create one clear demo ticket in Full Backlog and verify it remains idle. Move it to Selected
for Development; observe a GitHub run and a plan comment in Jira. Move it to Approved
with an allowed account. Observe independent validation, an open PR and the Jira completion reply.
Select an ambiguous ticket and answer its questions; observe a new plan. Leave PRs unmerged.

For a selected ticket whose event was missed, dispatch explicitly (Full Backlog still skips):

```sh
gh workflow run jira-agent.yml --ref main -f issue_key=YOURKEY-1
```

## Recovery and limits

- Per-ticket concurrency prevents simultaneous workers; GitHub can replace pending runs. Every
  run reconciles current Jira state. The optional six-hour schedule recovers missed work.
- There is no distributed transaction across Jira and GitHub. Comments have deterministic signed
  bodies and are reused after a partial write; published PR state retains the completion reply.
- A saved plan records its pending status transition. Reconciliation can finish that transition
  without another model call, provided the requirements/base are unchanged and the ticket has
  not subsequently moved to another status.
- No automatic retry of a failed model call in the same run. Fix the cause and dispatch again;
  reconciliation can retry incomplete work. Disable reconciliation while investigating persistent
  failures to avoid repeated paid calls. Jira Free automation and GitHub runner quotas still apply.
- A successful branch push followed by a PR failure can reuse an identical branch on retry. A
  differing branch fails without a force push; inspect it manually. Do not delete work to hide errors.
- Changes to requirements, the plan comment or default branch require a new plan/approval.
  Changing comments after approval counts as a requirements change in this minimal example.
- The patch allowlist permits only `src/` and `tests/`; dependency/policy changes need a separate
  maintainer task. Signed state prevents editing a Jira property to forge an approved plan.
- A signature failure requires investigating the property/key; do not blindly overwrite it.
- Up to 5,000 comments/changelog entries and a 12,000-character response are allowed. This is
  a small-ticket demo, not an unbounded issue-history ingestion service.
- Code checks run before PR creation because bot-created PRs may not trigger a second workflow.
  A human push to the PR runs normal CI. Review and merge remain human actions.
- Only plain-text Jira descriptions/comments are included; attachments and linked pages are
  not fetched. If essential context is there, the planning agent must ask for it.
- Existing comment edits/deletions are discovered on the next manual/scheduled reconciliation;
  the four configured rules only dispatch immediately for new comments and Summary/Description edits.

## Linux runner prerequisites

The pinned Codex CLI needs an existing `CODEX_HOME`; the wrapper creates it. On Ubuntu
24.04 the generation job installs distribution `bubblewrap` and loads its
`bwrap-userns-restrict` AppArmor profile, then reads `src/web/App.tsx` inside the Codex sandbox
before any model call. Adapt that path to your target repository. A sandbox setup failure
stops the job. The workflow does not disable sandboxing or globally disable AppArmor.
See [official Codex Linux prerequisites](https://learn.chatgpt.com/docs/sandboxing).

## Implementation activity label

`automation/config.json` defines `busyLabel: "implementation-busy"`. Trusted preparation adds
it after confirming approval and moving to In Progress. It remains during agent execution,
independent validation and publication. A final `always()` cleanup job removes it on success,
failure or ordinary cancellation. Adding/removing the label preserves all other labels and
is safe to repeat. A new serialized prepare also clears stale activity before making its decision.

After independent validation and PR publication, the publisher posts a new signed comment:
“Implementation finished. Ready for human review.” with the branch URL, PR URL and validation
run URL. These use explicit [Jira ADF hyperlink marks](https://developer.atlassian.com/cloud/jira/platform/apis/document/marks/link/)
so readers can click them; text round-tripping preserves signed comment verification.
It moves the ticket from **In Progress → Waiting for Review** and clears the busy
label. A person moves it to **In Review** when starting the review, then **Done** after completion.
There is no review-ready label. Recovery preserves Waiting for Review, In Review and Done,
and reuses the same completion comment rather than posting duplicate replies.

A force-cancel, unavailable runner or Jira outage can prevent cleanup; the next run repairs
that stale label, or an operator can remove it after checking GitHub Actions. Six-hour recovery
only runs when `AUTOMATION_ENABLED=true`. Label changes are not requirements and are excluded
from the context hash; the Jira edit rule watches only Summary and Description.

The implementation agent returns a candidate patch. It still attempts checks and must report
code failures honestly, but an OS sandbox prohibition on sockets/subprocesses is recorded as
an environment limitation and delegated to the fresh validation job. The full test/typecheck/
build gate must pass there before a PR can be published. No sandbox permissions are widened.

## Prepare a repeatable demo

`automation/demo-tickets.json` defines seven small, independent examples. Run the manual
**Prepare demo tickets** workflow to seed them into Full Backlog. By default it preserves
existing tickets and matches the `agent-demo-fixture` issue property, so rerunning does not
create duplicates or add visible labels. Existing `demo-*` labels are migrated into this
property before removal. This property is only fixture identity; it grants no agent approval.
It never selects or approves work and receives no model or GitHub publishing credential.

Use reset only on a dedicated demo project, with all ticket workers idle. Selecting
`reset_project=true` and supplying the exact `confirm_project` key deletes **every ticket
in that configured project**, including comments. It first exports issue content/comments
to a private, seven-day artifact and stops if the project changed before deletion. That
export is a content record, not a full Jira restore facility. GitHub PRs/branches are preserved.
After reset, Jira assigns new issue numbers; use the workflow's `demo-tickets` artifact.

```sh
gh workflow run demo.yml --ref main
```

Review actual generated plans before moving demo tickets to Approved. Leave PR merging
to a human. Do not commit to main while demonstrating a pending approval: a changed base
requires a fresh plan. The [demo guide](demo.md) describes the presentation sequence.
