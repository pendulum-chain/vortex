# Vortex Security Specification

This directory contains the security specification for the Vortex cross-border payment platform. Each file defines the **intended behavior** of a system module — the invariants that must hold, the threats that must be mitigated, and the concrete checks an auditor should perform against the actual code.

## Document Authority

Use documents in this order:

1. **Module specifications** define normative current behavior.
2. **`RISK-REGISTER.md`** is the only authority for current accepted, deferred, or
   deployment-dependent exceptions to those requirements.
3. **Retained review evidence** (`REVIEW-POST-1232-2026-07-30.md` and
   `PUBLIC-RELEASE-READINESS.md`) is non-normative. It remains only while its review or
   remediation context is still useful; status claims may be stale.
4. **Older audit results, findings trackers, and spec deltas** are kept in Git history,
   not alongside the maintained specification.
5. **Implementation-side notes** such as
   `apps/api/src/api/services/phases/blocks/INHERITED-ISSUES.md` provide engineering detail; every
   still-active exception must also be indexed in the risk register.

If code and a normative invariant disagree, treat the code as a finding. If a historical
document disagrees with a module specification or the risk register, the current normative
documents win.

## Purpose

1. **Audit baseline** — During code review, each spec file acts as the source of truth for "how it should work." Any deviation between code and spec is a finding.
2. **Future development reference** — Engineers and AI agents can read these specs to understand security expectations before modifying a module.
3. **Extensibility** — New integrations, chains, or features should get a corresponding spec file before implementation.

## How to Use

- **For auditing:** Walk through the Audit Checklist in each file. Every unchecked box is a gap.
- **For development:** Before changing a module, read its spec. If your change would violate an invariant, update the spec first (with review).
- **For new integrations:** Copy `05-integrations/_template.md` and fill it in for the new provider.

## Module Index

| Module | Path | Scope |
|---|---|---|
| Current Risk Register | `RISK-REGISTER.md` | Authoritative accepted, deferred, and rollout-dependent exceptions |
| System Overview | `00-system-overview/architecture.md` | Trust boundaries, component map, data flows |
| Supabase OTP Auth | `01-auth/supabase-otp.md` | Email OTP, session lifecycle, token handling |
| API Credential Auth | `01-auth/api-keys.md` | Unified pk\_/sk\_ credential record, capability matrix, validation, lifecycle |
| Admin Auth | `01-auth/admin-auth.md` | Admin bearer token, endpoint protection |
| Ephemeral Accounts | `02-signing-keys/ephemeral-accounts.md` | Client-side key generation, multi-chain, storage |
| Server-Side Signing | `02-signing-keys/server-side-signing.md` | Funding keys, executor keys, webhook signing |
| State Machine | `03-ramp-engine/state-machine.md` | Phase transitions, locking, idempotency, recovery |
| Quote Lifecycle | `03-ramp-engine/quote-lifecycle.md` | Creation, expiry, binding to ramp |
| Fee Integrity | `03-ramp-engine/fee-integrity.md` | Fee pipeline: quote-time snapshot, deduction, distribution, rounding |
| Discount Mechanism | `03-ramp-engine/discount-mechanism.md` | Partner discounts, subsidies, dynamic adjustment |
| Profile Partner Pricing | `03-ramp-engine/profile-partner-pricing.md` | Supabase profile assignments to ramp-specific partner pricing IDs |
| Recipient Transfers | `03-ramp-engine/recipient-transfers.md` | Invite token hashing/retention/expiry, token-bound redemption, invitation/relationship archiving, sender↔recipient authorization, transfer eligibility gate |
| Transaction Validation | `03-ramp-engine/transaction-validation.md` | Presigned tx verification, content validation, signing model |
| Ephemeral Account Lifecycle | `03-ramp-engine/ephemeral-accounts.md` | Funding, cleanup, stuck fund prevention |
| Ramp Phase Flows | `03-ramp-engine/ramp-phase-flows.md` | Per-corridor token flow, phase handler map, subsidy bounds |
| Block-Flow Architecture | `03-ramp-engine/block-flow-architecture.md` | Persisted flow identity, version dispatch, topology, schemas, and executor wiring |
| Token Relayer | `04-smart-contracts/token-relayer.md` | EIP-712, permit, known findings |
| Integration Template | `05-integrations/_template.md` | Template for new provider specs |
| BRLA | `05-integrations/brla.md` | BRLA anchor for BRL on/off-ramp |
| Mykobo | `05-integrations/mykobo.md` | Mykobo EUR on/off-ramp on Base (currently registration-gated) |
| Monerium | `05-integrations/monerium.md` | Server-side OAuth KYC/KYB and verification status mirroring |
| Alfredpay | `05-integrations/alfredpay.md` | Alfredpay on/off-ramp |
| Binance | `05-integrations/binance.md` | Binance USDT spot price used as the primary USD<>BRL rate source |
| FastForex | `05-integrations/fastforex.md` | Fiat forex price provider used by quote/conversion math |
| Resend | `05-integrations/resend.md` | Outbound email — auth mail relay and transactional notifications |
| Squid Router | `05-integrations/squid-router.md` | Cross-chain EVM routing |
| XCM Transfers | `06-cross-chain/xcm-transfers.md` | Pendulum↔Moonbeam↔AssetHub↔Hydration |
| Fund Routing | `06-cross-chain/fund-routing.md` | Subsidization, fee distribution, amount integrity |
| Rebalancer | `07-operations/rebalancer.md` | Automated liquidity management — BRLA↔axlUSDC (legacy, Pendulum), cost/profit/opportunistic USDC→BRLA→USDC (Base), and cost/profit-aware BRLA→USDC correction (Base low-coverage) |
| Secret Management | `07-operations/secret-management.md` | Env vars, rotation, blast radius |
| API Surface | `07-operations/api-surface.md` | Rate limiting, CORS, input validation, error handling |
| Client Observability | `07-operations/client-observability.md` | Request IDs, sanitized API client events, operational monitoring |
| Notifications | `07-operations/notifications.md` | In-app feed authorization, PII redaction rules, email dispatch status |

## Retained Evidence

| Document | Why it remains |
|---|---|
| `REVIEW-POST-1232-2026-07-30.md` | Latest full spec-first review of the block-flow architecture and the evidence that drove its remediation |
| `PUBLIC-RELEASE-READINESS.md` | Repository-history secret exposure review with remediation actions that still require operational confirmation |

## Checklist Semantics

- `[x]` means the stated current-code conformance check was performed and passed.
- `[ ]` means open, partially conforming, not verified, deployment-dependent, or not applicable
  to source-only review. The text must say which.
- Labels such as `[FAIL]`, `[PARTIAL]`, `[N/A]`, and `[EXISTING FINDING]` are not checkbox syntax
  and must not be used in normative module checklists.

## Usual Per-File Format

Most module specifications use these sections:

- **What This Does** — Brief overview, scope, why it matters for security.
- **Security Invariants** — Numbered, testable MUST-hold properties. The core of the spec.
- **Threat Vectors & Mitigations** — Attack → Defense pairs. Realistic scenarios for a financial platform.
- **Audit Checklist** — Concrete checkboxes to verify against actual code.

## Glossary

| Term | Definition |
|---|---|
| **Ramp** | A conversion between fiat and crypto (on-ramp = fiat→crypto, off-ramp = crypto→fiat) |
| **Ephemeral account** | A temporary blockchain account created per ramp, used for signing transactions, then discarded |
| **Phase** | A discrete step in the ramp state machine (e.g., `nablaSwap`, `distributeFees`) |
| **Nabla** | DEX on Pendulum used for token swaps |
| **XCM** | Cross-Consensus Messaging — the cross-chain transfer protocol between Polkadot parachains |
| **BRLA** | Brazilian Real stablecoin anchor (BRL on/off-ramp) |
| **Mykobo** | EUR fiat anchor for SEPA on/off-ramp on Base (settles EURC on Base; currently registration-gated) |
| **Monerium** | European e-money provider used for OAuth-based KYC/KYB verification and EUR profile status. |
| **Alfredpay** | Fiat payment provider supporting multiple currencies |
| **Binance** | Crypto exchange whose USDT/fiat spot ticker is the primary USD-to-fiat rate source for currencies with a liquid market (currently BRL via `USDTBRL`) |
| **FastForex** | Fiat exchange-rate provider used as the USD-to-fiat rate source for currencies without a Binance market, and the fallback after Binance for those that have one |
| **Squid Router** | Cross-chain swap/routing protocol for EVM chains |
| **Axelar** | Cross-chain messaging protocol used by SquidRouter for EVM-to-EVM bridging |
| **Avenia** | BRLA's internal settlement platform; handles BRLA transfers, swaps, and PIX payouts |
| **Subsidization** | When the platform tops up an ephemeral account to ensure the user receives the quoted amount |
| **pk\_/sk\_** | Public key / Secret key prefixes for the dual API key system |
| **PIX** | Brazilian instant payment system |
| **SEPA** | Single Euro Payments Area — European bank transfer system |
| **Coverage ratio** | Reserve ÷ liabilities for a Nabla swap pool; ratio > 1 means the pool is over-collateralized and triggers rebalancing |
| **Request ID** | Non-secret correlation identifier generated or propagated by the API for log/event debugging |
| **Client event** | Sanitized operational record of a partner-facing API request outcome |
