# Runbook: Monerium B2B Onramp — Client Onboarding

Deploy → manifest → verify → map → (automated: link + IBAN) → penny test → activate.
One pass per client. Spec: `docs/prd/monerium-b2b-implementation-plan.md`; API call
shapes below are the sandbox-validated ones from registry item T4 (2026-07-17).

Prerequisites: guardian key funded on the target chain; `MONERIUM_B2B_*` env set
(API creds, attestor key, RPC); partner paperwork complete; the client company
onboarded and KYB-approved on Monerium's side (partner KYC reliance) with its
Monerium profile UUID at hand; the partner configured as a managed-profile manager
(`PUT /v1/admin/managed-profile-managers/:profileId`, corridor `EU`, customer type
`business`).

## 1. Paperwork inputs (from the partner agreement)

- `destination` — client's payout address. CEX deposit addresses allowed; validate: EIP-55
  checksum, not zero/dead/precompile/token/router (the contract re-rejects token/router/self at
  init), warn-and-attest for contract addresses and CEX addresses (rotation risk — terms doc).
- `fallbackAddress` — client's **self-custodied** recovery address. Mandatory, no exceptions
  (Monerium acceptance condition). Must be distinct from custodial/CEX addresses.
- `feeBps` — per-client, immutable post-init. Pilot: `0` (registry B1).
- Signed terms including the redemption-limitation disclosure (registry B6 — Monerium requires
  it; see `docs/prd/monerium-b2b-terms-inputs.md`).

## 2. Deploy the forwarder

```bash
# predict, then deploy (guardian-only); salt = any unused bytes32, convention: client index
cast call $FACTORY "predictAddress(bytes32)(address)" $SALT --rpc-url $RPC
cast send $FACTORY "deployForwarder(address,address,uint16,bytes32)" \
  $DESTINATION $FALLBACK $FEE_BPS $SALT --rpc-url $RPC --private-key $GUARDIAN_KEY
```

The clone is initialized atomically in the deploy tx (`ForwarderDeployed` event). Record the
forwarder address + deploy tx hash.

## 3. Manifest: generate, verify, publish

From `contracts/monerium-forwarder/`:

```bash
bun script/generate-manifest.ts $FACTORY $RPC manifests/<chainId>-$FACTORY.json
bun script/verify-manifest.ts manifests/<chainId>-$FACTORY.json $RPC   # must PASS
```

(Some free RPCs refuse historical `eth_getLogs`; add `--logs-rpc <logs-capable-endpoint>` for
the event enumeration — all other reads stay on `$RPC`.)

Publish the manifest (commit + public location). The manifest is **consistency evidence, not a
trust root** (re-review R01): it lets anyone detect silent changes; it does not prove the
deployment was honest — that requires the verified source on the block explorer, so verify the
factory + implementation source there as part of this step.

## 4. Map the client to a managed profile

One idempotent admin call creates the managed child (business entity under the partner
manager), imports the Monerium KYB approval into `provider_customers`/`kyc_cases`, and
records the deployed forwarder as the `MoneriumAccount` row (status `onboarding`):

```
POST /v1/admin/monerium-b2b/accounts        (Authorization: Bearer $ADMIN_SECRET)
{
  "managerProfileId":  "<partner manager profile UUID>",
  "externalSubjectId": "<partner's immutable client id>",
  "contactEmail":      "<client ops contact>",
  "moneriumProfileId": "<Monerium profile UUID>",
  "forwarderAddress":  "<deployed clone>",
  "destination":       "<client payout address>",
  "fallbackAddress":   "<client self-custody recovery>",
  "feeBps":            0
}
```

Replaying the identical call is safe (200); divergent input is a 409, never an overwrite.
KYB submission via the API remains deliberately unimplemented (`submitKybData` → 501,
registry T3) — approval always happens on Monerium's side before this step.

## 5. Link + IBAN (automated)

The keeper's onboarding step (`monerium-b2b/onboarding.ts`, every cycle) picks up every
mapped account in `onboarding` status and, exactly-once via the profile-scoped
`financial_operations` ledger:

1. links the forwarder with the attestor signature (`POST /addresses`, constrained
   EIP-1271, EIP-191 variant; sandbox-validated per registry T4 — HTTP 201,
   `state: linked`, zero client interaction), then
2. requests IBAN issuance (`POST /ibans`, async — expect 202).

The IBAN lands on the `MoneriumAccount` row via the `iban.updated` webhook (or the next
cycle's `GET /ibans` read); from then on the association monitor treats the DB record as
the reference state. Nothing to do manually — verify the row has its IBAN before the
penny test, and check the logs if it stays empty for more than a few cycles.

## 7. Penny test

Purpose: prove the destination actually credits contract-originated USDC transfers (CEXes can
rotate or mis-credit) before real volume flows.

1. Send a small SEPA deposit to the new IBAN (sandbox: dashboard at sandbox.monerium.dev →
   Receive → "Simulate bank transfer"). Target forward amount: **5 USDC** (placeholder —
   registry B2).
2. Keeper converts and forwards automatically once the balance ≥ `minSwapAmount`; for a
   sub-minimum penny test, temporarily lower `minSwapAmount` (guardian, bounded by
   `MIN_SWAP_FLOOR`) or fund up to the minimum.
3. **Partner/client confirms credit at the destination** (explicit written confirmation —
   this is a diligence commitment in the terms, registry B5).

## 8. Activate

1. Activate the account (refused with 409 while the IBAN has not been issued):

   ```
   PATCH /v1/admin/monerium-b2b/accounts/<accountId>/status    (Authorization: Bearer $ADMIN_SECRET)
   { "status": "active" }
   ```

2. Confirm the monitoring pass picks the account up cleanly (no association/config alerts on
   the next cycle).
3. Hand the client's IBAN over via the partner. Done.

Failure at any step: nothing is at risk — the forwarder holds no funds until the client wires
EUR, and every recovery path (fallback sweep, dead-man sweep) is live from deployment.
