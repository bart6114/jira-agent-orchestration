# Verification evidence

Last updated: **2026-09-08**. The live demo now starts when work enters **Selected for
Development**. Two fresh tickets reached independently tested PRs; an ambiguous ticket
received real questions. All seven tickets were seeded into Full Backlog before selection.

## Live results

| Evidence | Observed result |
| --- | --- |
| [Reset and seed run](https://github.com/bart6114/jira-agent-orchestration/actions/runs/34189571847) | Exported the four old tickets, removed them, and created CXD-5 through CXD-11. The private content export has seven-day retention. |
| [CXD-5 selection run](https://github.com/bart6114/jira-agent-orchestration/actions/runs/34189637735) | Jira transition dispatched Codex; published plan `c28059e2f466` and moved to Plan Ready. |
| [CXD-6 selection run](https://github.com/bart6114/jira-agent-orchestration/actions/runs/34189652544) | Published plan `d085c4972c60` and moved to Plan Ready. |
| [CXD-7 clarification run](https://github.com/bart6114/jira-agent-orchestration/actions/runs/34189668595) | Asked three product questions about organization, ordering and persistence; moved to Needs Information. |
| [CXD-8 planning run](https://github.com/bart6114/jira-agent-orchestration/actions/runs/34189686173) | Published a rename-task plan; left awaiting approval. A changed main requires refreshing this plan before approval. |
| [Full Backlog negative check](https://github.com/bart6114/jira-agent-orchestration/actions/runs/34189767866) | Manually dispatched CXD-9; prepare and cleanup passed while generation, validation and publication were skipped. |
| [CXD-5 implementation](https://github.com/bart6114/jira-agent-orchestration/actions/runs/34189876146) | Prepare, generate, independent verify, publish and cleanup passed. Created [PR #3](https://github.com/bart6114/jira-agent-orchestration/pull/3) on `codex/CXD-5`. |
| [CXD-6 implementation](https://github.com/bart6114/jira-agent-orchestration/actions/runs/34189876414) | The same five jobs passed. Created [PR #2](https://github.com/bart6114/jira-agent-orchestration/pull/2) on `codex/CXD-6`. |

The two plans were read and approved through the allowed Jira account as part of the
user-authorized demo preparation. The seeding workflow never approves tickets. Real Jira
approval transitions triggered both implementation runs; the model did not approve itself.

Both implementation runs used repository base `b61742c`. Each changed only
`src/web/App.tsx`, `src/web/style.css` and `tests/web.test.tsx`. The independent validator
passed **14 API/UI tests for CXD-5** and **15 for CXD-6**, plus **23 orchestration fixtures**,
TypeScript and the production build in each run. These are separate, unmerged feature PRs.
Their changes have not been integrated together or manually tested for accessibility.

The agent reported sandbox restrictions on API-test sockets or fixture subprocesses. Those
limitations did not waive checks: the separate CI job applied each candidate patch in a fresh
checkout and passed the full commands before publishing. The PR body retains the agent's
handoff summary followed by the publisher's independent validation evidence. PRs created
with the workflow token do not automatically start another PR workflow; follow the linked
implementation run for the validation jobs.

The English board was checked after publication: **3 Full Backlog, 1 Needs Information,
1 Plan Ready, 2 Waiting for Review**. Both finished tickets lost `implementation-busy` and
received one automatic finished comment with actual clickable branch, PR and run links.
No review-ready label or manual duplicate completion comment was added.

## Local checks and screenshots

- Baseline `npm run check`: **4 API/UI tests**, TypeScript and production build passed on Node 22.23.2.
- `npm run demo:fixtures`: **23 passing orchestration fixtures**, including backlog idling,
  approval actor/timing, stale requirements/base/plan, HMAC state, forged markers, duplicate
  publication, pending transitions, label preservation, patch restrictions and CLI credential isolation.
- The baseline app was loaded in the browser with persisted sample tasks. Its open feature PRs
  remain outside main.
- The [visual guide](jira-visual-guide.md) contains **16 refreshed native screenshots** in English
  (US), including real selection, questions, plans, simultaneous implementation, final review
  handoff, all four rule configurations and the app. Captures show successive moments.

## Live configuration

| Resource | Verified state |
| --- | --- |
| [Repository](https://github.com/bart6114/jira-agent-orchestration) | Private, owner bart6114, default branch main |
| [Jira board](https://bartsworkspace-45974496.atlassian.net/jira/software/projects/CXD/boards/34) | Team-managed Kanban, nine statuses; Full Backlog is initial, Selected for Development is the planning entry |
| [Automation rules](https://bartsworkspace-45974496.atlassian.net/jira/software/projects/CXD/settings/automation) | Four saved and enabled: selection, replies, Summary/Description edits, approval. Creation trigger removed. |
| Reply/edit filters | Active-status JQL excludes Full Backlog and post-PR work; reply rule also excludes bot markers |
| Provider | Codex CLI 0.153.4, OpenAI API authentication, direct CLI invocation |
| Credentials | Jira site/cloud/project/approver variables and Jira/model/signing secrets configured; GitHub dispatch credential hidden in each Jira rule |
| Scheduled recovery | `AUTOMATION_ENABLED=false`; event-driven automation is enabled |

Renew the Jira API token and the repository-scoped GitHub dispatch token before their recorded
expiry, **2026-09-14**. Credential values are held in GitHub secrets or hidden Jira headers.
The earlier PR #1 and branch are preserved as historical GitHub work; the reset only removed
Jira tickets. The current demo uses PRs #2 and #3.

## Remaining verification and limits

- CXD-7 is intentionally waiting for an answer. The new-comment rule is configured, but its
  question → human reply → revised plan continuation has not yet been exercised in this reset.
- Human PR review, integration of both features, merge and deployment remain undone.
- Missed-event recovery, force-cancellation and service outages are not proven by the successful
  runs. Fixtures cover core recovery decisions; this is not an exactly-once queue.
- Linux generation uses the configured bubblewrap/AppArmor prerequisites and a sandbox source-read
  preflight. See [setup](setup.md#linux-runner-prerequisites) for portability requirements.
- Claude Code, subscription authentication, Azure DevOps and Jenkins are documented adaptation
  routes, not live-tested integrations. Provider sources were checked on 2026-09-07.
