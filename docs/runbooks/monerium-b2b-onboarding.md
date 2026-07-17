# Runbook: Monerium B2B Onramp — Client Onboarding

Deploy → manifest → verify → link → IBAN → penny test → activate. One pass per client.
Spec: `docs/prd/monerium-b2b-implementation-plan.md`; API call shapes below are the
sandbox-validated ones from registry item T4 (2026-07-17).

Prerequisites: guardian key funded on the target chain; `MONERIUM_B2B_*` env set
(API creds, attestor key, RPC); partner paperwork complete.

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

## 4. Create the Monerium profile + KYB

```
POST /profiles          { "kind": "corporate" }
```

Note: `GET /profiles` (list) 404s on the whitelabel sandbox — use per-profile paths
(`GET /profiles/{id}`). KYB submission is deliberately unimplemented (`submitKybData` → 501)
until the whitelabel KYB mechanism is contractually settled — **registry T3**; for sandbox and
until then, KYB completion happens on Monerium's side.

## 5. Link the forwarder address (attestor flow)

The backend signs the fixed link message with the attestor key
(`signLinkAttestation` in `apps/api/src/api/services/monerium-b2b/attestor.ts` — bound to
chainid + forwarder address; the contract validates via constrained EIP-1271, EIP-191 variant
only). Sandbox-validated call shape (T4):

```
POST /addresses
{
  "address":   "<forwarderAddress>",
  "chain":     "<chain>",                    // e.g. "ethereum"; sandbox spike used Sepolia
  "message":   "I hereby declare that I am the address owner.",
  "profile":   "<profileId>",
  "signature": "<attestor signature, 65-byte r‖s‖v hex>"
}
```

Expected: HTTP 201, address `state: linked` — zero client interaction (validated 2026-07-17,
including the hardened chainid-bound re-validation; sandbox artifacts in registry T4).

## 6. IBAN issuance

```
POST /ibans   { "address": "<forwarderAddress>", "chain": "<chain>" }
```

**Async: expect HTTP 202** (T4). Poll `GET /ibans` until the entry for the address appears with
state approved. Record the IBAN on the `MoneriumAccount` row (status stays `onboarding`) —
the association monitor treats the DB record as the reference state from here on.

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

1. Set the `MoneriumAccount` row to `active`.
2. Confirm the monitoring pass picks the account up cleanly (no association/config alerts on
   the next cycle).
3. Hand the client's IBAN over via the partner. Done.

Failure at any step: nothing is at risk — the forwarder holds no funds until the client wires
EUR, and every recovery path (fallback sweep, dead-man sweep) is live from deployment.
