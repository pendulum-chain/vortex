# ADR 0007: Partner-registered destinations for the Monerium B2B onramp

**Status:** Accepted 2026-10-06. Extends
[`adr-0005-monerium-b2b-onramp.md`](adr-0005-monerium-b2b-onramp.md); behaviour in
[`architecture-monerium-b2b-onramp.md`](architecture-monerium-b2b-onramp.md) (onboarding),
invariants in
[`security-spec/05-integrations/monerium-b2b.md`](security-spec/05-integrations/monerium-b2b.md)
(0, 12, 15 and the key separation), procedures in
[`operations-monerium-b2b-runbook.md`](operations-monerium-b2b-runbook.md) §1, §6 and §8.

## Context

The partner creates its clients' profiles and submits their KYB in its own Monerium
white-label app, so it holds each new client's Monerium profile ID; only it knows the
client's payout wallet. Until now a Vortex operator deployed every forwarder with `cast`
and mapped the account with an admin call, so every client waited on a manual step, and
the guardian key, which ADR-0005 intends to move to cold custody, was the only key that
could deploy.

## Decision

1. **Endpoint.** `POST /v1/monerium-b2b/accounts` takes the Monerium profile ID, the
   destination, the partner's client reference and a contact email, under the manager
   key only, never an admin impersonation token (403 `IMPERSONATION_NOT_ALLOWED`).
   Create-only per Monerium profile: an identical replay returns the registration's
   state; any difference in destination, client reference or contact email (compared
   case-insensitively) is 409 `MONERIUM_B2B_DESTINATION_CONFLICT`. A registration the
   keeper rejected may be registered again, with the same or corrected data (202, the
   row restarts). A client reference or contact email that collides with another client
   is 409 `MONERIUM_B2B_CLIENT_CONFLICT`, checked at the request and again before the
   keeper deploys. The profile must be known to the partner's app and neither rejected
   nor closed (422 `MONERIUM_B2B_PROFILE_UNAVAILABLE`); a Monerium failure, timeout,
   rate limit or 403 is 503 `MONERIUM_B2B_PROVIDER_UNAVAILABLE`, retry the identical
   request later. No KYB data is accepted.
2. **Separate table.** Requests live in `monerium_account_registrations` until mapped.
   An account row stays what it always was, a verified, deployed clone the mint watcher
   scans, and the admin mapping code is reused unchanged. The account list keeps its
   response shape; registrations have their own list, `GET /v1/monerium-b2b/registrations`,
   so a rejection is visible without replaying the request, and a registration that
   still waits says what for (`waitingReason`). Operators have the same view with the
   keeper's progress, and can withdraw a registration that is not mapped yet
   (`GET /v1/admin/monerium-b2b/registrations`, `POST .../registrations/:id/withdraw`).
3. **The keeper deploys.** Each cycle it takes the 20 least recently checked requested
   registrations, so none starves, and reads each profile (no `profile.updated`
   processing; one waiting for Monerium is asked again after a minute, and the step stops
   after 15 seconds). Once the profile is approved it deploys, at most one clone per cycle, and
   maps through the same verified provisioning as the admin call. The caller's salt is
   `keccak256(abi.encode(moneriumProfileId, destination))` and the factory binds it to
   the whole initialization: the CREATE2 address derives from
   `keccak256(abi.encode(destination, recoveryAddress, targetPpm, floorPpm, salt))`, so a
   crash adopts the predicted clone and nobody can occupy a client's address with other
   arguments. A deployment in flight is waited for; one without a receipt after 10
   minutes, or one that reverted, is sent again. A clone at the predicted address that is
   out of the registry long after any deployment was revoked by the guardian: the
   registration is rejected, since the same destination would always land on it. The
   keeper adopts an account an operator mapped by hand with the same destination for one
   of the registering manager's clients, and rejects the registration otherwise. It writes
   an outcome only while the row is still the one it loaded, and locks the row while it
   maps, so a withdrawal or the partner's new attempt during a cycle always wins. The
   registration step runs after the money steps and cannot hold a conversion or refund
   back.

   A registration is rejected only for a definite cause: Monerium rejected or closed the
   profile; the factory refused the arguments (`InvalidConfigAddress`, `ZeroAddress`,
   `InvalidFeePolicy`); a client conflict; a definite mapping conflict; an operator mapped
   the profile to another destination or client; the guardian revoked the clone; or an
   operator withdrew it. Everything transient
   (Monerium or RPC errors, a missing deployer role, an unfunded deployer, an inactive
   manager) leaves it waiting with a reason; triage is in the runbook §1.
4. **Deployer role.** The factory gained a guardian-managed deployer role that can only
   deploy clones, so deploying needs no guardian signature. The backend deploys with its
   own deployer key, which must differ from the attestor, guardian, keeper and float keys:
   it sends with implicit nonces like the keeper and the float wallet. Added before any
   Sepolia or mainnet factory exists, because the factory is not upgradeable. This does
   not make the guardian key cold: the backend still requires it at boot and signs the
   dormancy pause (`setGuardianPaused`) with it, so that pause is the open custody item
   of ADR-0005 O2 (a pause-only role, or an operator-run pause, before a cold guardian).
   The guardian can also revoke a clone: `revokeForwarder` is one-way and removes it from
   the registry (below).
5. **Partner binding by configuration.** `MONERIUM_B2B_PARTNER_MANAGER_PROFILE_ID` (read
   lowercased) names the one manager allowed to register, the partner owning the
   white-label app. Per-partner credentials and bindings are a later extension.
6. **Activation.** An operator call everywhere except the sandbox
   (`SANDBOX_ENABLED=true`, which boot pairs with `DEPLOYMENT_ENV=sandbox`), where a
   registered account activates once its IBAN is recorded; staging and development need
   the operator call too. A person checks the destination before money flows. Only an
   active account converts, which makes the check a gate: a payment that arrives before
   activation waits on the clone, and the partner sees `account_not_active` on the
   deposit (also while the account is suspended or dormant). The deadline
   (`MONERIUM_B2B_RECOVERY_DEADLINE_MINUTES`, 120 by default, counted from the mint) then
   refunds it, but only with `MONERIUM_B2B_AUTO_RECOVERY=auto`: `alert` logs `REFUND DUE`
   and `off` does nothing, so the operator marks the deposit by hand. The gate is a
   keeper-side policy, not an on-chain guarantee: after the clone's `TRIGGER_DELAY`
   (24 h) `swap` and `forwardAll` are permissionless, so a payment left on an unchecked
   account can still reach the registered destination. A destination that fails the
   check suspends the account (`onboarding` to `suspended`, once the IBAN is issued, since
   onboarding stops for a suspended account): nothing converts and recoveries still run. Activation records `activated_at` (the dormancy window of a
   never-converted account runs from it) and every status change is logged with its
   from and to status, destination and forwarder. Operators find the accounts waiting
   with `GET /v1/admin/monerium-b2b/accounts?status=onboarding`.
7. **No exchange-address distinction.** Every valid address is accepted the same way.
   An address an exchange retires after a long idle period is caught by the dormancy
   gate, and a wrong address by an optional penny test; a rotation on an account that
   keeps converting is not detected, so the destination stays with the partner
   (ADR-0005 B5).
8. **Profile kind.** The keeper reads a profile's state, not its kind, so a personal
   (individual) Monerium profile in the partner's app is accepted like a corporate one
   and mapped with a mirrored business KYB record. Accepted scope decision of the
   owner: the profile comes from the partner's own app and the operator checks the
   destination at activation; restricting registrations to corporate profiles is a
   later hardening.

Alternatives rejected: a `requested` status inside `monerium_accounts` (would weaken the
invariant every account row relies on); an operator deploying from a registration queue
(keeps the manual step); deploying with the guardian or keeper key (custody goal, nonce
interference); merging registrations into the account list (would change a typed
response partners already read).

## Consequences

- A destination is the most sensitive field a partner key can set and is fixed in the
  clone. Controls: create-only, only the bound manager, only profiles the partner's app
  can read, the clone verified on chain before mapping, `ACCOUNT_UPDATED` echoing the
  destination, and operator activation outside the sandbox.
- The API rejects only a malformed or zero destination (400). The factory refuses EURe,
  EURC, USDC, the router, the clone itself and the client's own refund wallet, which
  rejects the registration from the deployment simulation, not with a 400. Dead,
  precompile, contract and exchange addresses pass unscreened: the partner's written
  confirmation and the operator's check at activation are the controls.
- The deployer key is hot and pays one clone deployment per client; it is the fourth
  distinct key (and differs from the float key) and needs funding on each chain. A
  missing role (`NotDeployer`) or an empty deployer leaves the registration waiting
  (`deployer_not_ready`, Vortex's side) rather than rejected.
- The role's reach is wider than deploying. A deployer can create a registered clone for
  any destination and recovery address, and the subsidy vault pays any registered clone
  (`VortexSubsidyVault.pay` checks `FACTORY.isForwarder`), so a leaked deployer key can
  draw vault subsidies, bounded by the vault's `dailyBudget` and `maxSubsidyPpm`, the
  swap batch delay and the oracle band. `setDeployer(key, false)` stops new deployments;
  `revokeForwarder(clone)` (guardian only, one-way) makes the vault refuse a clone, so a
  swap that needs a subsidy reverts, and the backend refuse to map it; its forward and
  recover paths and its funds are untouched.
  Deployers, like keepers, survive a guardian transfer: a new guardian reviews them
  (`DeployerSet` events) and resets what it does not recognise. Procedure in the runbook
  §6.
- A payment sent before activation is not converted: it waits on the clone and is
  refunded at the deadline with automatic recovery, so the partner hands a client its
  IBAN once the account is `active`. Accounts mapped by the admin call follow the same
  rule; a penny test runs after activation.
