# ADR 0007: Partner-registered destinations for the Monerium B2B onramp

**Status:** Accepted 2026-10-06. Extends
[`adr-0005-monerium-b2b-onramp.md`](adr-0005-monerium-b2b-onramp.md); behaviour in
[`architecture-monerium-b2b-onramp.md`](architecture-monerium-b2b-onramp.md) (onboarding),
invariants in
[`security-spec/05-integrations/monerium-b2b.md`](security-spec/05-integrations/monerium-b2b.md)
(0, 12, 15 and the key separation), procedures in
[`operations-monerium-b2b-runbook.md`](operations-monerium-b2b-runbook.md) §1 and §8.

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
   key only. Create-only per Monerium profile: an identical replay returns the
   registration's state, a different destination or client reference is 409. The profile
   must be visible to the partner's app and not rejected. No KYB data is accepted.
2. **Separate table.** Requests live in `monerium_account_registrations` until mapped.
   An account row stays what it always was, a verified, deployed clone the mint watcher
   scans, and the admin mapping code is reused unchanged. The account list keeps its
   response shape; registrations have their own list, `GET /v1/monerium-b2b/registrations`,
   so a rejection is visible without replaying the request.
3. **The keeper deploys.** It polls the profile each cycle while the registration waits
   (no `profile.updated` processing), then deploys at the CREATE2 salt
   `keccak256(abi.encode(moneriumProfileId, destination))` and maps through the same
   verified provisioning as the admin call. A crash adopts the predicted clone; a
   deployment in flight is waited for; a contract refusal rejects the registration.
4. **Deployer role.** The factory gained a guardian-managed deployer role that can only
   deploy clones. The backend deploys with its own deployer key, kept apart from the
   keeper key, whose nonces belong to the execution recovery logic, and from the guardian
   key, which can now go cold. Added before any Sepolia or mainnet factory exists,
   because the factory is not upgradeable.
5. **Partner binding by configuration.** `MONERIUM_B2B_PARTNER_MANAGER_PROFILE_ID` names
   the one manager allowed to register, the partner owning the white-label app. Per-partner
   credentials and bindings come with the second partner.
6. **Activation.** An operator call in production, so a person checks the destination
   before money flows; automatic once the IBAN is recorded everywhere else. Only an active
   account converts, which makes the check a gate: a payment that arrives before
   activation waits on the clone and the deadline refunds it. Operators find the accounts
   waiting with `GET /v1/admin/monerium-b2b/accounts?status=onboarding`.
7. **No exchange-address distinction.** Every valid address is accepted the same way;
   the partner agreement carries the risk of rotating exchange deposit addresses.

Alternatives rejected: a `requested` status inside `monerium_accounts` (would weaken the
invariant every account row relies on); an operator deploying from a registration queue
(keeps the manual step); deploying with the guardian or keeper key (custody goal, nonce
interference); merging registrations into the account list (would change a typed
response partners already read).

## Consequences

- A destination is the most sensitive field a partner key can set and is fixed in the
  clone. Controls: create-only, only the bound manager, only profiles the partner's app
  can read, the clone verified on chain before mapping, `ACCOUNT_UPDATED` echoing the
  destination, and operator activation in production.
- The deployer key is hot and pays one clone deployment per client; it is the fourth
  distinct key and needs funding on each chain. A missing role (`NotDeployer`) leaves the
  registration waiting rather than rejected.
- Token or router destinations surface as a rejected registration from the deployment
  simulation, not as a 400.
- A payment sent before activation is refunded, not delivered, so the partner hands a
  client its IBAN once the account is `active`. Accounts mapped by the admin call follow
  the same rule; a penny test runs after activation.
