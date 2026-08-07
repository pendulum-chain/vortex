# Vortex code review instructions

## Review scope and priorities

- Review the complete base-to-head change and the combined behavior across files, not only the latest push or each file in isolation.
- Trace changed behavior end to end: untrusted input, business rules, persisted state, external side effects, and the returned or rendered result. Inspect directly affected callers, callees, and alternate branches before concluding the path is safe.
- Prioritize exploitable security issues, loss or misrouting of funds, authorization failures, data corruption, broken public contracts, concurrency bugs, and user-visible regressions.
- Review changed tests as production-quality evidence. Verify that assertions exercise the intended failure, boundary, retry, and fallback behavior and would fail if the implementation regressed.
- Only report a problem caused or exposed by the change. Do not request unrelated cleanup, speculative flexibility, one-use abstractions, or formatter/linter changes that Biome, ESLint, TypeScript, or CI already enforce.
- Every finding must describe a concrete failure scenario and impact, then propose the smallest practical fix. Do not leave vague “consider handling” comments.

## Repository invariants

- Treat `docs/security-spec/` as normative for security-sensitive behavior. Flag code/spec contradictions and behavior changes that leave the relevant specification stale.
- Treat public OpenAPI schemas, `packages/sdk` exports, and shared wire types as compatibility contracts. Check consumers and documentation when their shapes, semantics, defaults, or errors change.
- Changes to `packages/shared` can affect every application. Check downstream assumptions, and require the shared build before consumer verification.
- `FiatToken` has exactly `EURC`, `ARS`, `BRL`, `USD`, `MXN`, and `COP`; mappings and behavior branches must be exhaustive unless a documented capability deliberately excludes a token.
- New features need meaningful tests. Bug fixes need a regression test that fails without the fix unless the behavior cannot reasonably be automated.
- Do not review generated output as handwritten code (`routeTree.gen.ts`, OpenAPI declarations, contract artifacts, or build output); only flag it when the source change should have regenerated it and did not.
