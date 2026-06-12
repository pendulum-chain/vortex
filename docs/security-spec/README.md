# Vortex Security Specification

This directory contains the security specification for the Vortex cross-border payment platform. Each file defines the **intended behavior** of a system module — the invariants that must hold, the threats that must be mitigated, and the concrete checks an auditor should perform against the actual code.

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
| System Overview | `00-system-overview/architecture.md` | Trust boundaries, component map, data flows |
| Supabase OTP Auth | `01-auth/supabase-otp.md` | Email OTP, session lifecycle, token handling |
| API Key Auth | `01-auth/api-keys.md` | Dual-key system (pk\_/sk\_), validation, partner matching |
| Admin Auth | `01-auth/admin-auth.md` | Admin bearer token, endpoint protection |
| Ephemeral Accounts | `02-signing-keys/ephemeral-accounts.md` | Client-side key generation, multi-chain, storage |
| Server-Side Signing | `02-signing-keys/server-side-signing.md` | Funding keys, executor keys, webhook signing |
| State Machine | `03-ramp-engine/state-machine.md` | Phase transitions, locking, idempotency, recovery |
| Quote Lifecycle | `03-ramp-engine/quote-lifecycle.md` | Creation, expiry, binding to ramp |
| Fee Integrity | `03-ramp-engine/fee-integrity.md` | Fee calculation, dual-system discrepancy |
| Discount Mechanism | `03-ramp-engine/discount-mechanism.md` | Partner discounts, subsidies, dynamic adjustment |
| Transaction Validation | `03-ramp-engine/transaction-validation.md` | Presigned tx verification, content validation, signing model |
| Ephemeral Account Lifecycle | `03-ramp-engine/ephemeral-accounts.md` | Funding, cleanup, stuck fund prevention |
| Ramp Phase Flows | `03-ramp-engine/ramp-phase-flows.md` | Per-corridor token flow, phase handler map, subsidy bounds |
| Token Relayer | `04-smart-contracts/token-relayer.md` | EIP-712, permit, known findings |
| Integration Template | `05-integrations/_template.md` | Template for new provider specs |
| BRLA | `05-integrations/brla.md` | BRLA anchor for BRL on/off-ramp |
| Mykobo | `05-integrations/mykobo.md` | Mykobo EUR on/off-ramp on Base (active EUR rail) |
| Monerium | `05-integrations/monerium.md` | (Deprecated) Monerium EUR on-ramp — replaced by Mykobo |
| Alfredpay | `05-integrations/alfredpay.md` | Alfredpay on/off-ramp |
| Stellar Anchors | `05-integrations/stellar-anchors.md` | SEP-24, Spacewalk, Stellar payment (fully deprecated; EUR migrated to Mykobo, ARS removed) |
| Squid Router | `05-integrations/squid-router.md` | Cross-chain EVM routing |
| XCM Transfers | `06-cross-chain/xcm-transfers.md` | Pendulum↔Moonbeam↔AssetHub↔Hydration |
| Bridge Security | `06-cross-chain/bridge-security.md` | Spacewalk bridge trust model |
| Fund Routing | `06-cross-chain/fund-routing.md` | Subsidization, fee distribution, amount integrity |
| Rebalancer | `07-operations/rebalancer.md` | Automated liquidity management — BRLA↔axlUSDC (legacy, Pendulum) and USDC→BRLA→USDC (Base, default) |
| Secret Management | `07-operations/secret-management.md` | Env vars, rotation, blast radius |
| API Surface | `07-operations/api-surface.md` | Rate limiting, CORS, input validation, error handling |
| Client Observability | `07-operations/client-observability.md` | Request IDs, sanitized API client events, operational monitoring |

## Per-File Format

Every spec file uses exactly four sections:

- **What This Does** — Brief overview, scope, why it matters for security.
- **Security Invariants** — Numbered, testable MUST-hold properties. The core of the spec.
- **Threat Vectors & Mitigations** — Attack → Defense pairs. Realistic scenarios for a financial platform.
- **Audit Checklist** — Concrete checkboxes to verify against actual code.

## Glossary

| Term | Definition |
|---|---|
| **Ramp** | A conversion between fiat and crypto (on-ramp = fiat→crypto, off-ramp = crypto→fiat) |
| **Ephemeral account** | A temporary blockchain account created per ramp, used for signing transactions, then discarded |
| **Phase** | A discrete step in the ramp state machine (e.g., `nablaSwap`, `spacewalkRedeem`) |
| **Nabla** | DEX on Pendulum used for token swaps |
| **Spacewalk** | Bridge between Pendulum and Stellar |
| **XCM** | Cross-Consensus Messaging — the cross-chain transfer protocol between Polkadot parachains |
| **BRLA** | Brazilian Real stablecoin anchor (BRL on/off-ramp) |
| **Mykobo** | EUR fiat anchor for SEPA on/off-ramp on Base (settles EURC on Base) |
| **Monerium** | (Deprecated) EUR stablecoin issuer; previously used for EUR on-ramp via SEPA. Replaced by Mykobo. |
| **Alfredpay** | Fiat payment provider supporting multiple currencies |
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
