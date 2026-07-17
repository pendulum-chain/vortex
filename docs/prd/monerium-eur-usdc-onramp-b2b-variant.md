# B2B Variant: Zero-Touch Onboarding via Attestor-Linked Forwarder

**Status:** Selected for implementation (2026-07-17). Monerium compliance verbally accepted the pattern (Telegram; conditional on fallback capability, which is now mandatory by design). Written approval pending (G1), legal review pending (G2), adversarial review running in parallel with implementation.
**Date:** 2026-07-14, updated 2026-07-17
**Related:** [main PRD v2](./monerium-eur-usdc-onramp.md) · [review](./monerium-eur-usdc-onramp-architecture-review.md) · [re-review](./monerium-eur-usdc-onramp-architecture-rereview.md) · [deferred decisions](./monerium-onramp-deferred-decisions.md) · [implementation plan](./monerium-b2b-implementation-plan.md)

**Update 2026-07-17 — Monerium compliance outcome and scope decisions:**

- Monerium compliance accepts the attestor pattern **provided fallback capabilities are maintained**, and requires that clients be **explicitly informed that this setup limits their ability to redeem EURe directly with Monerium**. We committed to that disclosure (registry item B6).
- **Tier C is dropped:** a self-custodied `fallbackAddress` is mandatory for every client. Sections below that describe Tier C are retained for historical context only.
- **Issuer recovery backstop confirmed with a catch:** Monerium can burn tokens from a linked address and pay out — only to the customer's own external bank account, currently no fees, re-verification possible. But their recovery flow validates a signature against the linked address, which our constrained `isValidSignature` would reject. Exact recovery-message format needed from their technical team (registry item T1) so the forwarder can whitelist its hash at compile time; if unanswered by deploy, ship without it — the mandatory fallback address carries recovery, and the issuer backstop becomes best-effort.
- **Scope:** B2B variant implemented first (consumer flow is phase 2); backend targets the **whitelabel API** directly, developed against the sandbox during MSA negotiation.

---

## 1. TL;DR (for everyone)

**What this is.** A variant of our Monerium EUR→USDC onramp aimed at **business clients that come to us through a partner**. Each client gets a personal IBAN. Any euros they wire to it are automatically converted to USDC and delivered to a crypto address they chose upfront. The special part: **the client never has to touch a Vortex app, install a wallet, or digitally sign anything.** Onboarding happens entirely through paperwork (KYB with Monerium plus a contract with us that states their payout address).

**Why this wasn't possible before.** Connecting an IBAN to an on-chain account normally requires the client to digitally sign one declaration ("I own this address") — that was the single step in our consumer design that forced the client into a UI with a passkey. In this variant, the on-chain account is a small special-purpose program (a "forwarding contract") that **we** deploy for the client, and it is built so that **our own signature can complete that connection** — while the program itself physically cannot do anything except convert the client's euros and deliver them to the client's pre-agreed address.

**Why we're still not the custodian.** The obvious worry: "if Vortex signs, doesn't Vortex control the money?" No — and this is checkable by anyone reading the contract code on-chain. Our signing power is restricted inside the contract to exactly one sentence: the connection declaration. It cannot approve payouts, withdrawals, or transfers. Nobody — including us — can send the funds anywhere except the client's pre-agreed address (plus the client-controlled failsafes below). Our remaining powers are: run the conversion, pause it, and tune bounded operational parameters. We can delay money; we cannot take or redirect it.

**The trade-off, honestly.** Because the client holds no key, there is no all-purpose recovery lever if something unexpected breaks (a trading pool dries up, a price feed is retired, the payout address stops working). Every rescue path must be designed in upfront. Our answer (and a condition of Monerium's acceptance): every client **must** name one **fallback address they control** in the paperwork. All emergency flows point there. As a break-glass backstop behind that, Monerium itself can recover tokens from the linked address and pay them out to the client's own verified bank account. Clients are told explicitly (Monerium requires this) that EURe received at the forwarding address cannot be redeemed directly from it — redemption runs via withdrawal to their fallback address, or via Monerium's recovery process as a last resort.

(Earlier drafts had a "Tier C" for clients refusing any self-controlled address, and a "Tier B" where our partner holds emergency keys. Both are dropped: the partner declines custody-like powers, and Monerium's acceptance is conditioned on fallback capability.)

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

Decision history: Tier B (partner-held recovery role) rejected 2026-07-14 — the partner declines custody-like powers. Tier C (no fallback, stuck-but-safe) dropped 2026-07-17 — Monerium's acceptance is conditioned on maintained fallback capability. **Final policy: exactly one tier; the fallback address is mandatory.** CEX destinations are allowed (partner requirement).

### Mandatory fallback address (every client)

One additional paperwork field: a **self-custodied** `fallbackAddress`. It can call `updateDestination`, `sweep(token, to)`, and pause/unpause its own account. Plus an immutable **permissionless dead-man sweep**: anyone may move a stranded EURe balance to `fallbackAddress` after N days unconverted (proposal: 60). Non-custodial: all authority and all emergency targets are the client's. Note a useful quirk: Circle blacklisting blocks USDC transfers, not contract calls or EURe — even a blacklisted fallback can still rotate the destination and sweep EURe out.

### Redemption disclosure and issuer backstop (Monerium requirements/commitments, 2026-07-16/17)

- Client terms must state explicitly: *EURe received at the forwarding address cannot be redeemed directly with Monerium from that address; redemption requires withdrawal to your fallback address (from which you can redeem normally), or Monerium's recovery process as a last resort.* (Registry B6.)
- Issuer backstop: Monerium confirmed it can burn tokens from a linked address and pay out **only to the customer's own external bank account**, currently without fees, possibly requiring re-verification. Open item T1: their recovery flow validates a signature against the linked address — the forwarder must whitelist the recovery-message hash (compile-time constant) or the backstop fails-closed for contract addresses. If T1 is unanswered at deploy time, ship without the whitelist; the mandatory fallback carries recovery.

### Staleness must pause, not lose

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
| Destination changes | Owner-signed Safe tx | `fallbackAddress` only |
| Custody posture | User owns account | No one holds spend keys; Vortex delay-only powers; stronger in one way (no opaque owner-signature surface, cf. re-review R08), weaker in another (higher S0 provisioning trust) |
| Conversion policy | Identical (route, oracle, invariants, keeper) | Identical |

## 8. Open items

Tracked centrally in the [deferred-decisions registry](./monerium-onramp-deferred-decisions.md); summary:

1. **G1 written package from Monerium** — verbal acceptance exists (attestor pattern, disclosure requirement, recovery backstop); must be consolidated in writing, together with the pre-existing items: IBAN pinning (`PATCH /ibans`), profile portability, recall liability, corporate-KYB mechanism (T3), and the recovery-message format (T1).
2. **G2 legal:** custody opinion for the constrained-attestor construction; MiCA exchange/transfer-service scoping; disclosure enforceability.
3. **Partner/client terms:** destination warranty, liability allocation, dormancy re-confirmation mechanics, redemption disclosure (B6).
4. **Inherited re-review findings** — dispositions and concrete resolutions live in the [implementation plan](./monerium-b2b-implementation-plan.md): R01 (manifest trust root), R03 (enforceable start time — resolved via on-chain `strandedSince` marker), R04 (sweep vs attribution races), R05 (per-account pause — load-bearing for the dormancy gate), R06 (webhook durability), R09 (unsolicited-token rules), R10 (parameter/role invariants).
5. **Adversarial review of this variant** — runs in parallel with implementation (decision 2026-07-17); must cover the constrained `isValidSignature` (encoding, replay, T1 whitelist interaction) and the fallback mechanics.
