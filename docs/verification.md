# Verification and demo status

As of **2026-09-08**, the demo contains **3 Full Backlog tickets, 1 Needs Information,
1 Plan Ready and 2 Waiting for Review**. Agent work starts on entry to Selected for
Development. The application on main supports adding, completing and deleting tasks.

## Verified capabilities

| Capability | Evidence and result |
| --- | --- |
| Clear-ticket planning | [CXD-5](https://github.com/bart6114/jira-agent-orchestration/actions/runs/34189637735) and [CXD-6](https://github.com/bart6114/jira-agent-orchestration/actions/runs/34189652544): successful selection-triggered plan publication |
| Clarification | [CXD-7](https://github.com/bart6114/jira-agent-orchestration/actions/runs/34189668595): three questions about organization, ordering and persistence; Needs Information |
| Plan approval example | [CXD-8](https://bartsworkspace-45974496.atlassian.net/browse/CXD-8): rename-task requirements and a plan for human review. Approval requires a plan matching the current main commit. |
| Backlog guard | [CXD-9 check](https://github.com/bart6114/jira-agent-orchestration/actions/runs/34189767866): generation, validation and publication skip for an unselected ticket |
| Approved implementation | [CXD-5 pipeline](https://github.com/bart6114/jira-agent-orchestration/actions/runs/34189876146) and [CXD-6 pipeline](https://github.com/bart6114/jira-agent-orchestration/actions/runs/34189876414): successful prepare, generate, independent verify, publish and cleanup |
| Repeatable seeding | [Seeder check](https://github.com/bart6114/jira-agent-orchestration/actions/runs/34192992157): the same seven issue keys, no duplicate tickets and empty label fields |

## Open feature PRs

| Feature | PR and branch | Passing checks |
| --- | --- | --- |
| All / Active / Completed filters | [PR #3](https://github.com/bart6114/jira-agent-orchestration/pull/3), `codex/CXD-5` | [CI](https://github.com/bart6114/jira-agent-orchestration/actions/runs/34190898444): 14 API/UI tests, 23 orchestration fixtures, TypeScript and build |
| Remaining-task count | [PR #2](https://github.com/bart6114/jira-agent-orchestration/pull/2), `codex/CXD-6` | [CI](https://github.com/bart6114/jira-agent-orchestration/actions/runs/34190898405): 15 API/UI tests, 23 orchestration fixtures, TypeScript and build |

Both PRs contain changes only in `src/web/App.tsx`, `src/web/style.css` and `tests/web.test.tsx`.
They are separate, unmerged features. Their Jira tickets are in Waiting for Review, each with
one completion comment containing clickable branch, PR and validation-run links.

The publisher requires successful independent validation before PR creation. The agent's
own check results are a handoff report; sandbox restrictions on sockets or subprocesses do
not waive the separate CI gate. GitHub can require maintainer approval for additional PR
workflow runs. The implementation pipeline supplies validation evidence independently.

## Validation commands

- `npm run check`: TypeScript, 4 baseline API/UI tests and the production build.
- `npm run demo:fixtures`: 23 orchestration fixtures covering backlog idling, approval
  actor/timing, stale requirements/base/plan, HMAC state, forged markers, duplicate publication,
  pending transitions, label preservation, patch restrictions and CLI credential isolation.
- [Repository CI](https://github.com/bart6114/jira-agent-orchestration/actions/workflows/ci.yml)
  runs both commands on Node 22.

The [visual guide](jira-visual-guide.md) shows the current board, ticket content, rule
configuration and baseline app in English (US). Its workflow diagram explains the execution
and validation stages.

## Live configuration

| Resource | Configuration |
| --- | --- |
| [Repository](https://github.com/bart6114/jira-agent-orchestration) | Public, owner bart6114, default branch main |
| [Jira board](https://bartsworkspace-45974496.atlassian.net/jira/software/projects/CXD/boards/34) | Team-managed Kanban, nine statuses; Full Backlog is initial, Selected for Development is the planning entry |
| [Automation rules](https://bartsworkspace-45974496.atlassian.net/jira/software/projects/CXD/settings/automation) | Four enabled rules: selection, replies, Summary/Description edits and approval |
| Reply/edit filters | Active-status JQL excludes Full Backlog and post-PR work; reply rule also excludes bot markers |
| Provider | Codex CLI 0.153.4, OpenAI API authentication, direct CLI invocation; `CODEX_MODEL` is unset |
| Demo fixture identity | `agent-demo-fixture` issue property, separate from signed orchestration state |
| Activity indicator | `implementation-busy` while implementation and validation run |
| Credentials | Jira site/cloud/project/approver variables and Jira/model/signing secrets; GitHub dispatch credential in hidden Jira headers |
| Scheduled recovery | `AUTOMATION_ENABLED=false`; event-driven automation is enabled |

The Jira API token and repository-scoped GitHub dispatch token expire on **2026-09-14**.
Renew them before expiry. Credential values belong in GitHub secrets or hidden Jira headers.

## Verification limits

- CXD-7 awaits a human answer. The question → reply → revised plan continuation lacks live verification.
- Human PR review, combined-feature integration, accessibility checks, merge and deployment lack verification.
- Missed-event recovery, force-cancellation and service outages have fixture coverage for core
  decisions but lack live end-to-end verification.
- Linux generation requires bubblewrap/AppArmor and a sandbox source-read preflight.
  See [setup](setup.md#linux-runner-prerequisites) for runner requirements.
- Claude Code, subscription authentication, Azure DevOps and Jenkins are documented adaptation
  routes without live integration tests. Provider source check: 2026-09-07.
