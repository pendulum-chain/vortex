# B2B Variant: Zero-Touch Onboarding via Attestor-Linked Forwarder

**Status:** Design proposal for discussion — not yet reviewed, not approved by Monerium or legal
**Date:** 2026-07-14
**Related:** [main PRD v2](./monerium-eur-usdc-onramp.md) · [review](./monerium-eur-usdc-onramp-architecture-review.md) · [re-review](./monerium-eur-usdc-onramp-architecture-rereview.md)

---

## 1. TL;DR (for everyone)

**What this is.** A variant of our Monerium EUR→USDC onramp aimed at **business clients that come to us through a partner**. Each client gets a personal IBAN. Any euros they wire to it are automatically converted to USDC and delivered to a crypto address they chose upfront. The special part: **the client never has to touch a Vortex app, install a wallet, or digitally sign anything.** Onboarding happens entirely through paperwork (KYB with Monerium plus a contract with us that states their payout address).

**Why this wasn't possible before.** Connecting an IBAN to an on-chain account normally requires the client to digitally sign one declaration ("I own this address") — that was the single step in our consumer design that forced the client into a UI with a passkey. In this variant, the on-chain account is a small special-purpose program (a "forwarding contract") that **we** deploy for the client, and it is built so that **our own signature can complete that connection** — while the program itself physically cannot do anything except convert the client's euros and deliver them to the client's pre-agreed address.

**Why we're still not the custodian.** The obvious worry: "if Vortex signs, doesn't Vortex control the money?" No — and this is checkable by anyone reading the contract code on-chain. Our signing power is restricted inside the contract to exactly one sentence: the connection declaration. It cannot approve payouts, withdrawals, or transfers. Nobody — including us — can send the funds anywhere except the client's pre-agreed address (plus the client-controlled failsafes below). Our remaining powers are: run the conversion, pause it, and tune bounded operational parameters. We can delay money; we cannot take or redirect it.

**The trade-off, honestly.** Because the client holds no key, there is no all-purpose recovery lever if something unexpected breaks (a trading pool dries up, a price feed is retired, the payout address stops working). Every rescue path must be designed in upfront. That leads to two client tiers:

- **Tier A (default):** the client also names one **fallback address they control** in the paperwork. All emergency flows point there. Near-full recoverability.
- **Tier C (opt-in with signed disclosure):** the client refuses any self-controlled address (e.g. they only use an exchange account). Then stuck funds **wait safely in the contract** — visible, not lost, but frozen — until the problem clears. They accept that in writing.

(There was a Tier B — our partner holds the emergency keys for their clients — but the partner doesn't want that power either, since it would make *them* look like a custodian. Dropped.)

**Exchange (CEX) payout addresses are allowed** — the partner requires this. We manage the known risks (exchanges rotate deposit addresses silently) with: a small test transfer before go-live, an automatic pause if an account is dormant too long until the address is re-confirmed, a minimum payout size, and contract terms that put address-validity risk on the client/partner — same way traditional payout providers handle wrong-bank-account risk. One iron rule in all tiers: **we never send raw EURe to an exchange address** (exchanges don't support the token; it would be lost).

**What must happen before this ships.** (1) **Monerium must approve the pattern in writing** — the ownership declaration would be produced by us, not the client, and doing that without their blessing risks our account; (2) **legal review** — our non-custody argument is strong but "custody" isn't the only licensing question (automatically converting and forwarding for clients may itself be a regulated service under MiCA); (3) partner/client terms for the destination policy; (4) the open engineering findings from the ongoing architecture re-review also apply here.

---

## 2. Context (technical from here on)

The [main PRD v2](./monerium-eur-usdc-onramp.md) targets consumers: a Safe owned by the user's passkey plus a recovery owner, with a constrained swap module. Its one unavoidable UI moment is the Monerium link signature — the user's passkey signs `"I hereby declare that I am the address owner."`, validated via the Safe's EIP-1271.

For partner-sourced business clients we want **zero Vortex-side interaction**. KYB happens with Monerium (legacy OAuth app now, whitelabel later — portability is a G1 MSA item; currently confirmed only informally). The destination address arrives via contract paperwork. The only blocker was the link signature. This variant removes it.

## 3. Mechanism: the attestor-constrained forwarder

### 3.1 How Monerium's check works

Monerium validates a link by calling `isValidSignature(bytes32 hash, bytes signature)` (EIP-1271) on the to-be-linked contract — an off-chain `eth_call`, at link time. The message is a **fixed string**, so its EIP-191 hash is a compile-time constant. Redeem orders (`"Send EUR <amount> to <IBAN> at <timestamp>"`) are **also** EIP-1271-validated — this fact drives the whole design.

### 3.2 Why the naive version is unsafe

"Just make the deployer key the contract's 1271 owner" fails catastrophically: a general-purpose validation key doesn't just validate the link message — it validates **redeem orders too**. Vortex could then sign `"Send EUR <all of it> to <any IBAN>"` and Monerium would burn the EURe and pay out to an arbitrary bank account. Full disposal power: a theft path and unambiguous custody. The hard-coded forwarding logic is irrelevant because redemption bypasses it.

### 3.3 The constrained version

`isValidSignature` accepts **exactly one hash** and only from the Vortex attestor key, with the attestation bound to the specific contract:

```solidity
bytes32 constant LINK_HASH = /* EIP-191 hash of the fixed Monerium link message */;

function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4) {
    if (hash != LINK_HASH) return 0xffffffff;
    // attestor signs keccak256(address(this), LINK_HASH): no cross-contract replay,
    // and no third party can link this contract to a foreign Monerium profile
    address signer = ECDSA.recover(keccak256(abi.encode(address(this), LINK_HASH)), sig);
    return signer == VORTEX_ATTESTOR ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
}
```

Consequences:

- Vortex can complete the link with no client interaction.
- Vortex **cannot** sign redeem orders or anything else — the attestor key is provably not a "means of access" to the funds.
- Every other hash fails, so no future Monerium message type validates by accident.
- Restricting to the attestor key (rather than accepting the constant hash from anyone) prevents a third party with their own Monerium profile from linking our client's forwarder to *their* profile.

### 3.4 Contract shape

No Safe, no passkey, no fallback handler: the account **is** a minimal purpose-built forwarder (per client, or a singleton with per-client config — same Option B analysis as PRD v2 §6.2). It reuses the PRD v2 conversion policy unchanged: pinned EURe→EURC→USDC Uniswap v3 route, contract-constructed calldata, Chainlink EUR/USD `minOut` with staleness ceiling, `CALL` only, exact approvals with reset, atomic delta checks and forwarding, keeper + delayed permissionless trigger, guardian pause. Per-client config: `destination`, `fallbackAddress` (Tier A; zero for Tier C), `feeBps` (immutable post-init), tier flags.

## 4. Custody and compliance

| Power | Vortex? | Notes |
|---|---|---|
| Redirect minted funds to any address | **No** | Only `destination` / tiered failsafe targets; immutable logic |
| Sign redeem orders (fiat out) | **No** | 1271 constrained to the link hash |
| Withdraw / sweep to Vortex | **No** | No such function exists |
| Execute conversion, pause, tune bounded params | Yes | Delay-only powers; worst case within slippage bound + disclosed fee |
| Deploy the contract (provisioning) | Yes | S0 trust as in PRD v2; public config manifest still applies (re-review R01 caveat: the manifest is consistency evidence, not an independent trust root) |
| Move the IBAN at Monerium (`PATCH /ibans`) | Yes (credentials) | **Unchanged S1 risk** from PRD v2 — this variant neither worsens nor fixes it; G1 |

Three non-negotiable caveats:

1. **Monerium's written approval is required.** The link signature exists so Monerium can verify *the customer* controls the mint address; here the declaration is produced by Vortex about a contract in which the customer holds no key. Undisclosed, this is the "operating on behalf of third parties without prior written approval" pattern their ToS prohibits — heightened on the legacy OAuth app, where our whitelabel-portability assurances are informal. Present the pattern openly (immutable forwarder, on-chain-verifiable constraint, funds only reachable by the client); it is arguably *safer* for Monerium than a user EOA, but it's their call. New G1 item.
2. **Non-custody ≠ out of MiCA scope.** The constrained-attestor argument against custody (Art. 3(1)(17): no control of assets or means of access) is strong, and pause/params are delay-only powers. But *exchange of crypto-assets* and *transfer services on behalf of clients* are separate CASP services — automatic conversion+forwarding for clients may qualify regardless of custody. G2 counsel question; do not present "no custody" as "no license needed."
3. **Provisioning concentration.** With no user verification moment at all, S0 trust in Vortex is *higher* than in the consumer flow. The manifest/transparency machinery matters more here, not less.

## 5. The recovery problem

In the consumer design, the client's Safe ownership was a **universal escape hatch**: whatever broke, an owner could move the funds. With zero client keys, only pre-enumerated failures are recoverable; anything unforeseen is permanent. Concrete stuck states:

| State | Behavior without failsafes |
|---|---|
| Route dies (the EURe/EURC pool is ~$100k TVL — one LP leaving kills it) | Swaps revert forever; EURe accumulates permanently |
| Chainlink retires the EUR/USD feed (routine, weeks of notice) | Staleness check fails forever; permanent |
| EURe depeg beyond slippage bound | Reverts by design; permanent if depeg persists |
| Destination blacklisted by Circle | Atomic revert; EURe accumulates permanently |
| **CEX rotates/closes the deposit address** | **Nothing reverts — funds keep arriving somewhere the client no longer controls. Silent loss; undetectable on-chain** |
| Vortex disappears | Permissionless trigger keeps the happy path alive; combined with any state above → stuck |

## 6. Failsafe stack and destination policy

Decisions (2026-07-14): **Tier A default, Tier C opt-in; Tier B (partner-held recovery role) rejected — the partner declines custody-like powers.** CEX destinations are allowed in both tiers (partner requirement).

### Tier A — client names a fallback address (default)

One additional paperwork field: a **self-custodied** `fallbackAddress`. It can call `updateDestination`, `sweep(token, to)`, and pause/unpause its own account. Plus an immutable **permissionless dead-man sweep**: anyone may move a stranded EURe balance to `fallbackAddress` after N days unconverted (proposal: 60). Non-custodial: all authority and all emergency targets are the client's. Note a useful quirk: Circle blacklisting blocks USDC transfers, not contract calls or EURe — even a blacklisted fallback can still rotate the destination and sweep EURe out.

### Tier C — no client-controlled address exists (signed disclosure)

Stranded funds **stay in the contract**: visible, auditable, frozen until conditions clear — never force-delivered. One bounded softener: after N days stranded, the swap may execute with a stepwise-relaxed slippage bound up to an immutable ceiling (proposal: 1% → 5%), still delivering USDC only to `destination`. Converts "stuck on a modest depeg / thin liquidity" into "delivered with a bounded haircut"; a fully dead route remains stuck-but-safe. Client signs: *if conversion fails and you provided no recovery address, funds wait in the contract; nobody — including Vortex — can move them.*

### Both tiers — staleness must pause, not lose

- **Never send raw EURe to a CEX destination.** Iron rule; EURe-recovery targets are the fallback (A) or the contract itself (C).
- **Penny test** at activation: small USDC forward, client/partner confirms exchange credit before the IBAN goes live (also catches exchanges that mis-credit contract-originated token transfers).
- **Dormancy gate:** no successful forward for X days (proposal: 60) ⇒ forwarding pauses until the destination is re-confirmed (partner API ping suffices — still zero client UI). Rotation risk concentrates in dormancy; this converts silent loss into a pause.
- **Minimum forward ≥ the exchange's minimum deposit**; below it, accumulate.
- **Liability allocation in the terms:** client/partner warrants destination validity and bears rotation losses; Vortex commits to the penny test and dormancy gate as diligence. This is how traditional payout processors carry the same risk (a wrong/closed bank account is the instructing party's loss) — contractual allocation is the only mechanism that can actually hold it, since a CEX address's continued validity is not verifiable on-chain.

Residual loss scenario in Tier A: client loses the fallback key **and** the destination breaks — ordinary self-custody residual. In Tier C: any unforeseen terminal failure — accepted in writing.

## 7. Differences vs the consumer flow (PRD v2)

| | Consumer (PRD v2) | B2B variant |
|---|---|---|
| Client interaction | Passkey ceremony + one link signature | None on Vortex side (KYB with Monerium + paperwork) |
| Account | Safe v1.4.1, passkey + recovery owner | Minimal forwarder, no owners |
| Link signature | User passkey via Safe EIP-1271 | Vortex attestor via hash-constrained EIP-1271 |
| Universal recovery | Owners can do anything | None — tiered failsafes only (§6) |
| Destination changes | Owner-signed Safe tx | `fallbackAddress` only (Tier A); impossible (Tier C) |
| Custody posture | User owns account | No one holds spend keys; Vortex delay-only powers; stronger in one way (no opaque owner-signature surface, cf. re-review R08), weaker in another (higher S0 provisioning trust) |
| Conversion policy | Identical (route, oracle, invariants, keeper) | Identical |

## 8. Open items

1. **Monerium approval of the attestor pattern** (new G1 item) — blocking; raises account-termination risk if skipped. Related G1 items unchanged: IBAN pinning (`PATCH /ibans`), OAuth→whitelabel profile portability (currently Telegram-only), recall liability.
2. **G2 legal:** custody opinion for the constrained-attestor construction; MiCA exchange/transfer-service scoping; Tier C disclosure enforceability.
3. **Partner/client terms:** destination warranty, tier selection, liability allocation, dormancy re-confirmation mechanics.
4. **Inherited re-review findings** that apply to this variant and must be resolved in the normative spec: R01 (manifest trust root), R03 (enforceable start time for the delayed permissionless trigger — same mechanism used here for the dead-man sweep), R04 (balance-sweep vs deposit-attribution races), R05 (per-account pause semantics — load-bearing for the dormancy gate), R06 (webhook durability), R09 (unsolicited-token rules), R10 (parameter/role invariants).
5. **Adversarial review of this variant** — in particular the constrained `isValidSignature` (encoding, replay, interaction with any future Monerium message types) and the tier mechanics. This document is a proposal, not a reviewed spec.
