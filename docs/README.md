# Project Documentation

This is the entry point for durable Vortex documentation. The aim is one maintained
home for each kind of information, not a record of every implementation session.

## Where information belongs

| Location | Purpose | Authority |
|---|---|---|
| [`security-spec/`](security-spec/README.md) | Security invariants, trust boundaries, current risks, and audit evidence | Normative for security-sensitive behavior |
| [`api/`](api/README.md) | Partner-facing OpenAPI and published integration guides | Public API contract and publication source |
| [`architecture/`](architecture/) | Current internal architecture that spans multiple modules | Maintained description of the implemented system |
| [`decisions/`](decisions/) | Accepted architectural decisions and their rationale | Historical decision record; later ADRs may supersede earlier ones |
| [`product/`](product/) | Current product behavior, scope, and acknowledged gaps | Product intent, not low-level implementation detail |
| [`operations/`](operations/) | Testing, operational behavior, runbooks, and incident reports | Maintained engineering and operations guidance |
| [`research/`](research/) | Durable external research used to inform a decision | Dated evidence, not a statement of current product behavior |
| [`proposals/`](proposals/) | Active discussion drafts awaiting a decision | Non-authoritative and temporary |

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
3. For implemented behavior, verify the current code, migrations, and tests. Architecture
   docs explain that behavior but do not override it.
4. Product docs state intended scope. Proposals and research never override current code,
   an accepted ADR, or a normative spec.

When maintained documents disagree, fix or clearly mark the stale one in the same change.
Do not leave agents to choose between conflicting versions.

## Rules for creating or changing docs

Before adding a Markdown file:

1. Search this index and the relevant directory. Update an existing canonical document
   whenever it has the same audience and lifecycle.
2. Create a new file only for a distinct durable responsibility. Give it a clear status
   when it is not current or authoritative.
3. Link to implementation instead of copying file inventories, schemas, or command lists
   that are already obvious from the repository.
4. Update links and indexes in the same change.

Do not add:

- agent memory banks, active-context logs, progress journals, or handoff notes;
- completed implementation plans or refactor summaries;
- a second architecture document for behavior already owned by `security-spec/`;
- an in-repository archive of stale docs. Git history is the archive.

### Proposals and decisions

Active proposals live in `proposals/` and must state their status and the decision they
seek. When accepted, capture the lasting rationale as an ADR in `decisions/`, update the
current architecture or product doc, and remove the proposal. When rejected or abandoned,
remove it; the Git history preserves the discussion.

ADRs use `NNNN-kebab-case.md` and contain: status, context, decision, consequences, and
links to current specifications. Amend an ADR only to clarify it; create a later ADR when
the decision changes and mark the earlier one superseded.

### Incidents and research

Keep an incident report when it contains durable evidence, causal analysis, and follow-up
controls. Put it under `operations/incidents/` with an ISO date in the filename. Keep
external research only when it is dated, sourced, and still useful for a live decision.

## Documentation definition of done

For a change that affects documented behavior:

- update the canonical document, not a new summary;
- cross-check `security-spec/` when the change is security-sensitive;
- update public API docs when a partner-visible contract changes;
- verify relative Markdown links;
- remove temporary plans that the change completed or superseded.
