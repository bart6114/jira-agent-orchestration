# Present the demo

Start with the [English Jira walkthrough](jira-visual-guide.md) and check the
[verification record](verification.md). This is a Kanban demonstration of selecting work,
clarifying requirements, approving a plan, implementing it and handing over a tested PR.
The app on main supports adding, completing and deleting tasks. Generated feature PRs remain
separate and unmerged; the examples are independent, not a pre-integrated release.

## The prepared tickets

| Ticket | Example | Role in the demo |
| --- | --- | --- |
| [CXD-5](https://bartsworkspace-45974496.atlassian.net/browse/CXD-5) | All / Active / Completed filters | Clear requirements → approved plan → implementation → tested PR |
| [CXD-6](https://bartsworkspace-45974496.atlassian.net/browse/CXD-6) | Remaining-task count | Second independent feature following the same automatic path |
| [CXD-7](https://bartsworkspace-45974496.atlassian.net/browse/CXD-7) | Organize a busy task list | Deliberately ambiguous; agent asks questions and waits |
| [CXD-8](https://bartsworkspace-45974496.atlassian.net/browse/CXD-8) | Rename an existing task | Concrete API/UI requirements; plan available for human approval |
| [CXD-9](https://bartsworkspace-45974496.atlassian.net/browse/CXD-9) | Search by title | Future idea in Full Backlog; no agent work |
| [CXD-10](https://bartsworkspace-45974496.atlassian.net/browse/CXD-10) | Clear completed tasks | Future idea in Full Backlog; product decisions still needed |
| [CXD-11](https://bartsworkspace-45974496.atlassian.net/browse/CXD-11) | Export for a weekly check-in | Future idea in Full Backlog; format undecided |

The exact reusable requirements live in [demo-tickets.json](../automation/demo-tickets.json).
These keys belong to this demo account. A new setup or reset gets its own keys.

## A five-minute tour

1. Show **Full Backlog**: creating, editing or discussing an idea here does not start a model.
2. Explain **Selected for Development**: moving chosen work here starts planning. Selection
   is a product decision; it is not approval of an implementation plan.
3. Open CXD-7 in **Needs Information**. Show the real questions and explain that the agent
   waits rather than inventing a product decision. For an interactive continuation, answer
   its actual questions with the intended behavior, for example an optional alphabetical
   A–Z sort, default off, case-insensitive, no saved preference, preserving tasks.
4. Open CXD-8 in **Plan Ready**. Read the plan and its acceptance criteria. Leave it pending
   for the audience to approve. If main changed since it was generated, refresh the plan
   with a manual dispatch first and approve only the latest plan.
5. Show the recorded **In Progress** screenshot of CXD-5 and CXD-6, their real workflow runs,
   and the **Waiting for Review** column they reach when independent checks pass.
6. Open a completion comment: PR, branch and validation-run URLs are clickable. Open its PR
   to show the code and independent test evidence. Move to **In Review** only when a person
   begins reviewing. Leave merging to a human.

For a live coding segment, select and review a fresh clear ticket, then move **Plan Ready →
Approved**. The worker adds `implementation-busy`, runs Codex, validates independently,
creates the PR, posts one signed completion comment, clears the label and moves the ticket
into Waiting for Review. In Progress is transient; do not leave a fake busy ticket there
just to make the board look active.

## Reset or seed again

The manual **Prepare demo tickets** workflow seeds all seven examples into Full Backlog.
Default mode uses the `agent-demo-fixture` issue property and preserves existing tickets.
Old `demo-*` labels are migrated into that property and removed. Destructive reset is
for a dedicated demo project only, with workers idle, and requires the exact project key.
See [setup](setup.md#prepare-a-repeatable-demo) for the content export, deletion scope and commands.
No seeding step writes a fake plan, approves a ticket or creates a pretend PR.

## What this demonstrates in the wider SDLC

This example covers the selected-ticket-to-PR portion. Full Backlog is the issue backlog;
Selected for Development is the chosen work queue, not a scheduled sprint. Planning enriches
requirements; implementation produces code and tests; CI plus human review validates them.
Roadmap intake from sales/support, sprint capacity planning, production deployment/monitoring,
automated review revisions and incident-to-backlog feedback are outside this minimal example.
The validation gate has API/UI tests, typecheck and build, not a coverage threshold, security
review, load-test suite or documentation-accuracy gate. Done does not prove deployment.
