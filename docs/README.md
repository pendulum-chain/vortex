# Project Documentation

This is the entry point for durable Vortex documentation. The aim is one maintained
home for each kind of information, not a record of every implementation session.

## Where information belongs

Only two topics are large enough to earn their own directories:

| Location | Purpose | Authority |
|---|---|---|
| [`security-spec/`](security-spec/README.md) | Security invariants, trust boundaries, current risks, and audit evidence | Normative for security-sensitive behavior |
| [`api/`](api/README.md) | Partner-facing OpenAPI, generated types, publication scripts, and integration guides | Public API contract and publication source |

The smaller set of general project documents stays directly in `docs/`:

| Document | Purpose |
|---|---|
| [`adr-0001-user-gated-ramp-registration.md`](adr-0001-user-gated-ramp-registration.md) | Accepted architectural decision and rationale |
| [`adr-0002-alfredpay-fee-collection.md`](adr-0002-alfredpay-fee-collection.md) | Accepted decision on Alfredpay fee collection and sequential EVM fee distribution |
| [`architecture-identity-model.md`](architecture-identity-model.md) | Current cross-module identity and ownership architecture |
| [`operations-api-credential-rollout.md`](operations-api-credential-rollout.md) | Operational runbook for the API credential production rollout |
| [`operations-legacy-schema-cleanup.md`](operations-legacy-schema-cleanup.md) | Deployment gates and recovery runbook for irreversible migration 060 |
| [`operations-testing.md`](operations-testing.md) | Maintained test strategy and suite boundaries |
| [`product-dashboard.md`](product-dashboard.md) | Current dashboard product scope and acknowledged gaps |
| [`proposal-headless-profiles-and-pricing-plans.md`](proposal-headless-profiles-and-pricing-plans.md) | Active proposal for delegated management of headless customer profiles |
| [`proposal-mcp-server.md`](proposal-mcp-server.md) | Active, non-authoritative discussion draft |

The root [`README.md`](../README.md) is human onboarding, [`MAP.md`](../MAP.md) is
repository wayfinding, and `CLAUDE.md` files contain instructions for coding agents.
Those files should link here instead of duplicating project state.

Repository-specific workflows may live under `.agents/skills/` when they are bounded,
invocable capabilities rather than general project memory. Keep their factual claims
linked to or synchronized with the canonical API and security documentation.

Code-adjacent `README.md` files are appropriate only when a subsystem has a non-obvious
local contract that a contributor needs while editing it. Examples include the block-flow
engine and token configuration. Public package READMEs remain with their packages.

## Authority and conflicts

Use the most specific maintained source:

1. For security requirements and accepted exceptions, use `security-spec/` and its
   [authority rules](security-spec/README.md#document-authority).
2. For partner-visible requests and responses, use the OpenAPI source under `api/`.
3. For implemented behavior, verify the current code, migrations, and tests. Current
   architecture and product docs explain that behavior but do not override it.
4. Proposals and historical evidence never override current code, an accepted ADR, or a
   normative spec.

When maintained documents disagree, fix or clearly mark the stale one in the same change.
Do not leave agents to choose between conflicting versions.

## Rules for creating or changing docs

Before adding a Markdown file:

1. Search this index and update an existing canonical document whenever it has the same
   audience and lifecycle.
2. Start new general documentation directly under `docs/` and name it
   `<kind>-<topic>.md`. The supported kind prefixes are `architecture`, `product`,
   `operations`, `adr`, `incident`, and `proposal`.
3. Create a subdirectory only when a coherent subsystem has multiple maintained artifacts
   or its own generation/publishing tooling.
4. Give non-current or non-authoritative files an explicit status.
5. Link to implementation instead of copying file inventories, schemas, or command lists
   that are already obvious from the repository.
6. Update links and this index in the same change.

Do not add:

- agent memory banks, active-context logs, progress journals, or handoff notes;
- completed implementation plans or refactor summaries;
- a second architecture document for behavior already owned by `security-spec/`;
- an in-repository archive of stale docs. Git history is the archive.

### Proposals and decisions

Active proposals use `proposal-<topic>.md` and must state their status and the decision
they seek. When accepted, capture the lasting rationale as `adr-NNNN-<topic>.md`, update
the current architecture or product document, and remove the proposal. When rejected or
abandoned, remove it; Git history preserves the discussion.

ADRs contain: status, context, decision, consequences, and links to current
specifications. Amend an ADR only to clarify it; create a later ADR when the decision
changes and mark the earlier one superseded.

### Temporary evidence

An active incident investigation may use `incident-YYYY-MM-DD-<topic>.md`. Remove it once
the root cause and lasting controls are represented by code, tests, the security spec, or
the risk register; Git history preserves the forensic record. Summarize external research
in the proposal or ADR it informs instead of retaining a standalone vendor report after
the decision no longer needs it.

## Documentation definition of done

For a change that affects documented behavior:

- update the canonical document, not a new summary;
- cross-check `security-spec/` when the change is security-sensitive;
- update public API docs when a partner-visible contract changes;
- verify relative Markdown links;
- remove temporary plans that the change completed or superseded.
