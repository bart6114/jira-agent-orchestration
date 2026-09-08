# Instrumenting Your Jira-Based Software Development Lifecycle with AI

**Ticket → clarify → plan → human approval → implement → independently validate → PR → human review**

This example connects all eight steps, with AI handling clarification, planning and implementation,
CI checking the result, and people approving the plan and reviewing the code.

| Step | Who | What happens in this example |
| --- | --- | --- |
| 1. Ticket | Human | Creates a ticket in **Full Backlog** (no agent run), then moves chosen work to **Selected for Development**. |
| 2. Clarify | Agent + human | Selection starts planning. If context is missing, the agent posts questions in Jira and waits for a human reply. |
| 3. Plan | Agent | Posts an implementation plan in Jira and moves the ticket to **Plan Ready**. |
| 4. Human approval | Human | Reads the plan and moves **Plan Ready → Approved** using an allowed approver account. |
| 5. Implement | Agent | Writes code for the approved plan; the ticket moves to **In Progress** and gains `implementation-busy`. |
| 6. Independently validate | CI | Applies the patch in a fresh job and runs tests, typecheck and build. |
| 7. PR | Automation | Creates a branch and PR after validation passes, posts a completion comment with PR/branch links, moves the ticket to **Waiting for Review**, and clears `implementation-busy`. |
| 8. Human review | Human | Moves **Waiting for Review → In Review** when starting review, reviews and merges the PR manually, then moves to **Done**. |

`implementation-busy` stays on during the implementation pipeline and clears on completion,
failure or ordinary cancellation. It indicates activity; **In Progress** alone is not proof
that a worker is still running.
**Waiting for Review** means the tested PR is ready for a person to pick up. **In Review**
means human review has started. There is no separate review-ready label.

Clarification is skipped when the ticket already has enough context. Changed requirements or
a changed repository base require a fresh plan and approval. PR review feedback, merging and
deployment are not automated in this example.

## How the example runs

A small, readable example of **Jira events driving a coding agent in CI**. A React/Node to-do
app gives the agent something real to change. Codex is called directly through its CLI;
GitHub Actions supplies the runner, job boundaries, secrets and artifacts.

The configured workflow targets Codex with API authentication. [AGENTS.md](AGENTS.md) explains
how another agent can scaffold this pattern with **Codex or Claude Code**, using **API or
subscription authentication**, and adapt it to other CI/Git providers.

**Board model:** this is Kanban. **Full Backlog** holds future ideas; **Selected for Development**
means work has been chosen, not that its implementation plan is approved. We use that name
instead of Sprint Backlog because this example has no time-boxed sprints or capacity planning.
Creating or editing a backlog ticket does not invoke the agent. Moving into Selected for
Development starts clarification/planning; **Plan Ready → Approved** starts implementation.

See the [current demo tickets](docs/demo.md), [illustrated Jira walkthrough](docs/jira-visual-guide.md)
and [verification record](docs/verification.md) for live results and limitations. The prepared
board has three backlog ideas, one clarification, one plan awaiting approval, and two tested
PRs in Waiting for Review: [task filters (#3)](https://github.com/bart6114/jira-agent-orchestration/pull/3)
and [remaining-task count (#2)](https://github.com/bart6114/jira-agent-orchestration/pull/2).

![Demo intake: backlog ideas and selected work before planning](docs/screenshots/01-board-intake.png)

## Try the app

```sh
npm ci
npm run dev
# Open http://127.0.0.1:5173
npm run check
npm run demo:fixtures
```

Use Node 22.13 or newer (`.nvmrc` selects Node 22). SQLite data stays in `data/todos.db`.
`npm run build && npm start` serves the built app at http://127.0.0.1:3001.
The backend intentionally binds to localhost. The UI supports add, complete and delete;
the sample Jira tickets propose features that do not yet exist.

## Ask your agent to adapt it

> Read this repository's AGENTS.md and minimal working example. Adapt the Jira →
> clarification/plan → approval → implementation → PR workflow to my repository.
> Inspect my environment first, preserve its existing conventions, ask only for missing
> setup decisions, and verify the resulting integration. My target repository is `<path>`.

- [Agent adoption guide](AGENTS.md): reading order, interfaces, provider recipes, recent sources.
- [Setup](docs/setup.md): credentials, project statuses, exact Jira request, recovery.
- [Jira visual guide](docs/jira-visual-guide.md): current English screenshots, board columns and every trigger.
- [Authentication](docs/authentication.md): API versus subscription and runner choices.
- [Porting](docs/porting.md): Azure DevOps and Jenkins equivalents.
- [Demo script](docs/demo.md): example tickets and the walkthrough.
- [Verification](docs/verification.md): evidence and remaining setup work.

## The small pieces

| Piece | Responsibility |
| --- | --- |
| `src/` | React UI, Express API and SQLite storage |
| `automation/core.mjs` | Pure approval, context, signature and validation logic |
| `automation/jira.mjs` | Jira REST adapter, comments, transitions, durable state |
| `automation/cli.mjs` | Prepare, agent execution, patch validation, publication and recovery |
| `automation/prompts/` and `schemas/` | Visible agent instructions and output contracts |
| `.github/workflows/` | CI jobs and their credential/artifact boundaries |

We deliberately call `codex exec` instead of the Codex action so the invocation is visible
and portable. OpenAI recommends its action for GitHub and it supplies additional credential
handling; this example instead separates credential-bearing publication from agent execution,
scopes the model key to the invocation, and validates code in a fresh job. It is an educational
starting point, not an enterprise isolation solution. [Official guidance](https://learn.chatgpt.com/docs/non-interactive-mode).

No automatic merging, deployment, custom webhook server, or generic agent framework.
