# Monerium B2B Onramp — Rollout

What still stands between the implemented system and a live pilot on the engineering
side: the external audit gate, the deploy checklist, and the open items ledger. Decisions and parameters are
final in [`adr-0005-monerium-b2b-onramp.md`](adr-0005-monerium-b2b-onramp.md);
procedures in [`operations-monerium-b2b-runbook.md`](operations-monerium-b2b-runbook.md).

## Gates

**G3 — external contract audit.** Parameters are final (ADR); the internal reviews and
the invariant suite are done, but this moves client funds.

## Deploy checklist (mainnet bring-up)

The Sepolia sandbox follows its own procedure in the runbook (§8).

1. Apply database migrations from exactly one deployment instance. Migration execution
   is not serialized across replicas; do not let multiple instances run the migrator
   concurrently. Migrations 076/077 install allocation accounting and its exact
   same-block boundary. Treat 076 as forward-only after activation: its `down` migration
   refuses to discard any existing allocation rows, so restore from backup instead of
   forcing a rollback once conversions have been attributed. Migrations 078/079 add the
   ppm fee policy and the pricing columns: before applying them, confirm no `Pending`
   `monerium_conversion_executions` row has a NULL `reference_rate_raw` or `route_index`
   (it would stay in flight forever and block its account) and no deposit-converted
   outbox delivery is still pending (it would replay without the `execution` block).
2. **Treasury first (O2):** create the dedicated fee Safe multisig — `FEE_RECIPIENT` is
   immutable in the implementation. Confirm guardian key custody plan (EOA acceptable
   for pilot; hardware/multisig at GA).
3. Re-verify the initial route's pools and fee tiers at the deploy block (P10) and re-run
   the liquidity baseline quote methodology (T6); confirm `perSwapCap` €10k still
   executes within floor plus the per-swap subsidy cap, and decide whether a second
   route (direct EURe→USDC or other tiers) is worth whitelisting from day one.
4. Deploy implementation + factory with the final parameters (ADR table: 52 h oracle
   age, 60 bps floor on the net, 1% fee cap, 100 bps reference band, 2 h recovery / 24 h
   trigger delays, €1 floor/€50k ceiling, initial 5 bps/5 bps route; the recovery address
   is per client, passed at each clone's deployment); set operational `minSwapAmount`
   €1 and `perSwapCap` €10k; register the keeper key and grant the deployer key its role
   (`setDeployer`).
4a. Deploy `VortexSubsidyVault` (USDC, the fee Safe as treasury, the factory, 50 bps per
   swap, 200 USDC per day — P13), point the factory at it (`setSubsidyVault`), and fund
   it from the treasury with the first days of budget. Runbook §2.6 has the commands.
5. Verify factory + implementation source on the block explorer; generate, verify, and
   publish the manifest.
6. Production credentials for the partner's white-label app from Monerium; configure the keeper backend (the
   mykobo flow variant only): credentials, attestor/keeper/guardian/deployer keys (four
   distinct; keeper and deployer funded), `MONERIUM_B2B_PARTNER_MANAGER_PROFILE_ID` (the
   partner manager allowed to register destinations), `MONERIUM_B2B_REFUND_SEED` (derives every client's refund wallet),
   read RPC + private orderflow RPC, webhook secret, and
   `MONERIUM_B2B_FORWARDER_FACTORY_ADDRESS`; the backend needs outbound HTTPS to
   `api.exchange.coinbase.com` for the reference rate (P12) — without it every swap
   defers. Keep `MONERIUM_B2B_ENABLED=false` until G3 is done and the launch is signed off.
7. Register the webhook endpoint at Monerium (`profile.updated`, `iban.updated`,
   `order.created`, `order.updated`).
8. Before first production onboarding, simulate a SEPA deposit end to end (dashboard →
   Receive → "Simulate bank transfer") and re-verify the signed `webhook-id`,
   `webhook-timestamp`, and `webhook-signature: v1,<base64>` fixture against a real
   production delivery.
9. Partner side: manager profile configured (EU corridor, business type), secret
   credential issued, deposit-event webhook registered and verifying signatures against
   `GET /v1/public-key`.
10. Confirm every mapped forwarder has a zero EURe balance before the first enablement.
    The mint cursor bootstraps at the current settled head and intentionally does not
    convert historic, unindexed balances; reconcile any pre-existing balance manually.
11. Set `MONERIUM_B2B_ENABLED=true` on only the designated `mykobo` keeper backend and
   restart. Startup must fail if any required B2B setting is absent. Confirm the routes,
   raw webhook parser, and keeper are active before accepting a deposit.
12. Per client: runbook §1 (partner registration, or deploy clone → map; automated
   link/IBAN → activate → optional penny test). Before the first enablement on a backend
   that already holds accounts, run the runbook §1.7 check for `onboarding` accounts that
   already have an IBAN: they stop converting until activated.

## Open items ledger

| Item | Owner | Status |
|---|---|---|
| G3 audit | External | After PR merge; params final |
| Sandbox SEPA simulation + 3 TODO(sandbox) pins | Engineering | Open — only remaining engineering unknown |
| Fee Safe multisig creation | Ops | Before implementation deploy; also the subsidy vault's treasury |
| Subsidy ladder calibration | Ops ↔ product | Launch ladder in P14; retune from the `deferring conversion` shortfall lines and the vault spend after the first weeks; raise the vault's per-swap cap to the ladder's top before enabling |
| Reference band value (P12, 100 bps) | Engineering | Confirm against observed weekend Chainlink gaps before the implementation deploy (immutable). The effective downside margin is `SLIPPAGE_BPS − floorPpm` ≈ 45 bps after the 2026-09-17 move to 60 bps: the twelve-month replay on spot (2026-09-18, ADR amendment 3) shows six minute-long blips a year at that margin outside the 2025-10 depeg weekend, so ordinary weekends do not refund; the depeg weekend (39.7 h out of the 100 bps band) does, by design |
| Refund seed + float wallet | Ops | Generate `MONERIUM_B2B_REFUND_SEED` (32 random bytes; every client's refund wallet derives from it, and onboarding links each to its client's profile) and the EURe float key; fund the float with EURe and ETH (it pays the refund wallets' gas); both into the keeper's KMS. No Vortex company profile is needed |
| Refund automation | Ops | Implemented (`recovery.ts`): ship with `MONERIUM_B2B_AUTO_RECOVERY=alert`, observe one sandbox refund end to end, then `auto` with the float key set; refunds of EUR 15,000 or more stay manual (Monerium requires a supporting document from that amount) |
| Sandbox SEPA simulation: payer counterpart | Engineering | Capture one real issue-order webhook to confirm `counterpart.identifier.iban` / `details.name` arrive as the spec says (the refund target) |
| Memo-routed mint to a refund wallet | Engineering | Open: detect it and handle it as a refund |
| Monerium read-back | Engineering | Open: read the issued IBAN and the issue order's payer IBAN and name back from Monerium's API instead of relying on webhook payloads alone (the payer IBAN is the refund target); check in the sandbox whether listing the app's webhook subscriptions returns their secrets (Monerium's guide says so, the response schema has no secret field), since every holder of the app's credentials can list Vortex's subscription |
| Subsidy vault funding and refill cadence | Ops | Before first activation; runbook §2.6 |
| GA items | Engineering | Backend volume-limit enforcement (revisit), guardian key to hardware/multisig, O1 migration endpoint when first needed |
