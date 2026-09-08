# Adapt to Azure DevOps or Jenkins

The scripts, prompts and result schemas are the reusable part. The GitHub publisher in
`automation/cli.mjs` is intentionally concrete. A different Git host needs a different publisher,
while a different CI system can continue publishing to GitHub if that is where the repository lives.

| Responsibility | GitHub example | Azure DevOps adaptation | Jenkins adaptation |
| --- | --- | --- | --- |
| Receive Jira request | Workflow dispatch | Queue a pipeline through the Azure DevOps REST API | Authenticated build-with-parameters endpoint; account for CSRF configuration |
| Checkout | Pinned checkout action | Repository checkout at recorded SHA | Git checkout at recorded SHA |
| Secret injection | Step-level secrets | Secret variables/Key Vault scoped to task | Credentials Binding scoped to stage |
| Execute | Node scripts + Codex CLI | Same scripts on compatible agent | Same scripts on compatible worker |
| Transfer results | Context/result artifacts | Pipeline artifacts | Stash/unstash or restricted artifact storage |
| Serialize | Per-issue concurrency group | A lock/queue keyed to issue | Lockable resource keyed to issue |
| Independent checks | Separate credential-free job | Separate validation job | Separate clean worker/stage |
| Publish | Git + `gh pr create` | Azure Repos PR API if using Azure Repos | API/CLI belonging to your Git host |
| Recovery | Scheduled Jira reconciliation | Scheduled pipeline | Timer-triggered job |

Do not copy a YAML file and call the integration verified. Map each row, replace `gh` dispatch
and publication calls where necessary, and run the end-to-end ticket test. Subscription-based
Codex execution needs an additional global auth-cache lock across every issue.

Keep the model call visible. A provider adapter should accept the prepared JSON and checkout,
produce the shared result JSON and patch, and return a nonzero status on failure. Claude returns
an output envelope; extract its structured payload before validation. Permissions and auth are
provider-specific, not a universal `--auto` flag.

Retain these properties: authoritative Jira reads, explicit human transition approval, signed
plan state, restricted patches, fresh-context publication checks, no integration secrets in
agent/validation jobs, and recovery after partially completed writes.

These are **porting instructions**, not tested Azure or Jenkins pipeline examples. Check your
provider's current REST/runner documentation while implementing the selected adapter.
