# PR #1317 (Implement managed profiles) — review findings

Deep multi-lens review with adversarial verification, and the fixes applied on this branch.
Verdict at review time: **not mergeable** until the two P1 findings were fixed. Both are now
fixed, each with a regression test that fails without the fix.

Status legend: [x] fixed · [~] documentation only · [ ] deliberately not changed

## P1 — blockers (fixed)

- [x] **F1 — Corridor allowlist bypass via query/body desync.**
  The `managedProfileCorridor` resolvers read `req.query.country ?? req.body?.country` while
  the Alfredpay POST handlers read `req.body.country` only, so a manager with
  `allowedCorridors=["MX"]` could send `?country=MX` with body `{country:"CO"}` and operate in
  the ungranted CO corridor. `validateResultCountry` used `query || body` and did not detect
  the divergence.
  **Fix:** the resolvers fail closed when query and body disagree, and `validateResultCountry`
  rejects the ambiguous pair with a `400` so no handler ever sees it.
  Tests: `managedProfileCorridor.test.ts` (both resolvers) and an end-to-end route test in
  `alfredpay-managed-customer.integration.test.ts`.

- [x] **F2 — Cross-profile Alfredpay customer adoption → KYC/identity bypass.**
  On a `409` from Alfredpay `createCustomer`, the controller adopted whatever customer that
  email returned; `verifyConflictingCustomer` checked only country and type, never ownership.
  A managed child's `contactEmail` is manager-chosen, unverified, and unique only per manager,
  so a manager could point a child at an email whose customer is already KYC-verified and
  inherit that verification.
  **Fix:** `isAlfredpayCustomerClaimedByAnotherProfile` blocks adoption of a customer already
  bound to a different profile; adoption still succeeds when nothing claims it, preserving the
  retry case where an earlier creation reached Alfredpay but failed to persist here.
  Tests: cross-profile adoption rejected, unclaimed adoption still allowed.

## P2 (fixed)

- [x] **F8 — Mykobo error string broke the SDK's typed-error mapping.** `parseAPIError` still
  matched the pre-PR literal, so `MykoboKycRequiredError` silently degraded to a generic error.
  Fixed with the retired BRL message (F15) in the same pass, plus regression tests following
  the file's existing "current backend message" pattern.

## P3 (fixed)

- [x] **F6 — dualAuth regressed a transient Supabase outage from 503 to 500.** The Bearer
  branch now mirrors `requireAuth`'s 503/401 mapping. (The original finding also claimed a
  401→500 regression for non-transient errors; that half was refuted — those already returned
  401.)
- [x] **F11 — re-revoking a child credential rewrote `revoked_at`.** Only the first revoke now
  writes. Note: idempotent success (204) is the documented contract for this path and is
  preserved — an existing test asserts it.
- [x] **F12 — admin re-provision returned 500 instead of 409.** Both error classes
  `createManagedProfile` raises are now mapped.
- [x] **F16 — provisioning ignored `allowedCustomerTypes`.** Rejected at creation instead of
  creating a child the manager could never operate. Note this makes a mismatched child
  reachable only by tightening policy *after* provisioning, so two Alfredpay tests that relied
  on creating one directly now narrow the manager after the child exists — which is the real
  sequence the request-time check defends against.
- [x] **F17 — `external_subject_id` immutability was declared but unenforced.** Added the
  trigger mirroring `contact_email` (migration 063 is unshipped, so edited in place).
- [x] **F19 — provisioning/deletion race.** Deletion now takes the same manager-row lock
  provisioning uses, keeping manager-first ordering in both paths.
- [ ] **F21 — corridor CHECK accepts empty and duplicate arrays.** *Not changed — the finding
  was wrong.* Tightening the constraint to require a non-empty array broke
  `managed-profile-quote-ramp-lifecycle.integration.test.ts`: setting `allowed_corridors = []`
  is how every corridor is revoked from a manager while leaving it active, which is a
  legitimate state the spec relies on ("corridor removal blocks mutations"). The schema test
  now pins that empty is allowed, so this cannot be "fixed" again by mistake. Duplicates are
  harmless and blocked by the admin controller.
- [x] **F22 — extra `User.findByPk` on every credentialed request.** The profile kind is now
  loaded via the existing association instead of a second round-trip.
- [x] **F25 — missing `await` on a `.rejects` assertion.**
- [x] **F26 — `/v1/webhook` silently ignored `X-Managed-Profile-Id`.** Now rejected.
- [~] **F7 — new provider brand names in whitelabeled partner docs.** The line this PR added
  now describes routes by corridor. Pre-existing Alfredpay/BRLA mentions elsewhere in
  `docs/api` are untouched — a separate cleanup.

## Not changed (deliberate)

- [ ] **F5 residual — post-deletion status reads.** The fund-stranding claim was refuted:
  unstarted ramps commit nothing, and started ramps continue in the server-side phase processor
  regardless of profile status. The residual is that a manager loses live status visibility for
  a deleted child, which sits in mild tension with ADR-0003's "status reads remain available
  where reconciliation requires them". Whether to allow status-only reads after deletion is a
  product decision, not a defect — left for the author.
- [ ] **F10 — delegated quote observability events still carry the manager's `partnerId`**
  while the persisted quote is partner-less. The drop itself is load-bearing (`ownershipAuth`
  depends on it); the event/DB divergence is a reporting choice worth confirming, not a bug.
- [ ] **F2 residual — unverified `contactEmail`.** The ownership check closes the realistic
  attack. A fully-closed version would make `contactEmail` globally unique or verified, which
  changes the ADR's per-manager uniqueness model — a design decision for the author.

## Refuted (recorded to avoid re-litigation)

- **F3** public managed key gains context — self-scoped, no escalation.
- **F4** deletion blocks re-onboarding — intended per ADR-0003; yields a clean 409.
- **F9** invariant 26 unimplemented — every enumerated operation is guarded.
- **F13** EU corridor footgun — children do have a stored contactEmail; mechanism misdiagnosed.
- **F14** brla `quoteId` unused — spec F-064 requires presence only, which is enforced.
- **F18** delete locks an arbitrary row — released in the same fast transaction; negligible.
- **F20** one bad row 409s the whole page — a customer-entity count ≠ 1 is unreachable.
- **F23** quote-lifecycle invariant 17 contradiction — this PR added invariant 18 documenting
  the managed branch; 17 and 18 are layered, not contradictory.
- **F24** sk_ callers 400 on Alfredpay create — pre-existing and documented in the OpenAPI.
