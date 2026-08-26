# Monerium Integration

## What This Does

`@vortexfi/shared` provides a server-to-server Monerium white-label API client authenticated with
the `client_credentials` grant. It maps profile status, linked addresses, IBAN provisioning and
movement, EURe redemption orders, supporting-document uploads, and webhook subscriptions. All
white-label credentials, tokens, and API calls remain backend-only.

The client supplies profile status, wallet ownership, and IBAN data for the active Polygon EUR
onramp. New SEPA/EUR BUY quotes resolve exclusively to `MoneriumOnrampPolygonCrossChain`; Mykobo
flows remain executable only for persisted legacy quotes and ramps. New SEPA/EUR SELL quotes are
rejected with public `400 Bad Request` because no active EUR offramp exists.

The Polygon onramp issues EURe to the profile-linked owner, funds the ephemeral, transfers the exact
quoted post-fee EURe from the owner, swaps it through the pinned Polygon Uniswap V3 EURe/USDC pool,
distributes fees and applies any bounded post-swap subsidy in Polygon USDC, then uses Squid for
destination settlement. Registration snapshots the owner's Polygon EURe balance before releasing
the SEPA instruction. Execution advances when the balance reaches that baseline plus the quoted
post-fee EURe amount. This is balance-delta attribution, not provider-order correlation.

Monerium's token APIs currently list Ethereum, Gnosis, Polygon, Arbitrum, Linea, Base, and Noble in
production, plus Sepolia, Chiado, Amoy, Arbitrum Sepolia, Linea Sepolia, Base Sepolia, Scroll Sepolia,
and Grand in sandbox. Scroll Sepolia is token-discovery-only and is not accepted by Monerium's
operational address, IBAN, or order schemas. The reusable Vortex blocks support only the intersection
with existing Vortex EVM networks and clients: Ethereum, Polygon, Arbitrum, Base, Polygon Amoy, and
Base Sepolia. Adding another Monerium chain requires an explicit Vortex network/client configuration
and official EURe token metadata; the block MUST NOT silently substitute a different chain. EURe is
an internal route asset and remains outside the shared public token registry.

The cataloged route is a parameterized flow factory with a canonical executor instance. Its Polygon
conversion is pinned to EURe `0x18ec0A6E18E5bc3784fDd3a3634b31245ab704F6`,
native USDC `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`, the 500-fee pool
`0x368A930B71326e3f640Df36378d931DbE3D03746`, factory
`0x1F98431c8aD98523631AE4a59f267346ea31F984`, router
`0xE592427A0AEce92De3Edee1F18E0157C05861564`, and quoter
`0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6`.

## Release Boundary

The active product boundary is the backend EUR BUY flow for a pre-provisioned corridor-ready legal
entity. Both individual and business entities are eligible when they have an approved local
Monerium/`eur` provider-customer binding, the bound provider profile is still approved, exactly one
existing Polygon EOA/IBAN destination resolves for that profile, and the API client can collect a
permit from that EOA. The API neither selects identity from caller input nor creates the missing
provider resources.

The following are explicitly deferred and MUST NOT be inferred from the shared client's endpoint
coverage: EUR SELL, profile creation/import, OAuth-to-white-label migration, KYC/KYB lifecycle
orchestration, user-to-corridor binding, wallet linking, IBAN provisioning/movement, and first-party
SDK/dashboard/widget execution of the owner-wallet signing journey. A direct API client can complete
the active onramp; the first-party clients cannot yet do so.

## Deferred OAuth And Imported Profiles

- Vortex operates a sibling authorization-code/PKCE Monerium application for KYC/KYB onboarding.
  Profiles onboarded there may later be migrated into the white-label application through a process
  that is still to be defined.
- Profiles may also be imported from other trusted external sources. Every source MUST associate the
  correct Monerium profile UUID with the correct Vortex legal entity; no caller-controlled profile
  adoption may be exposed while the import contract is undefined.
- The migration/import trigger, identifiers, persistence transitions, and status reconciliation are
  TBD. This specification does not decide whether the OAuth and white-label paths share or reuse
  `provider_customers` or `kyc_cases`.
- Profile-scoped persistence MUST remain limited to the Monerium profile identifier and compliance
  status. Addresses and IBANs remain provider-authoritative; any selected values needed by a ramp
  belong in quote or ramp state, not a permanent Monerium profile table.
- A Monerium mint address MUST belong exclusively to one Monerium profile and MUST never be shared
  across profiles. Incoming deposits are attributed to that profile through its dedicated address.

## Security Invariants

1. White-label credentials MUST use `MONERIUM_WHITELABEL_CLIENT_ID` and `MONERIUM_WHITELABEL_CLIENT_SECRET`, remain backend-only, and never be accepted from caller input.
2. `MONERIUM_API_URL` MUST use HTTPS. Every authenticated call MUST request API v2, encode dynamic path/query values, and use an explicit 10-second timeout.
3. Authentication MUST send form-encoded `client_credentials`. Access tokens MUST be cached only in memory, coalesced across concurrent requests, renewed before expiry, and reacquired at most once after `401`.
4. Client secrets, access tokens, signatures, request bodies, and raw provider response bodies MUST NOT appear in logs, structured errors, or Vortex API responses. Error endpoint fields MUST use route templates rather than customer identifiers.
5. Successful provider responses MUST be validated against consumed wire schemas. Malformed successful responses MUST surface as contract violations, not trusted typed values or provider-availability errors.
6. Profile kinds and states MUST preserve Monerium's documented values. The profile UUID used by active registration MUST remain bound to the correct Vortex legal entity.
7. The wallet-ownership message MUST remain exactly `I hereby declare that I am the address owner.` Callers SHOULD obtain it through `buildMoneriumWalletLinkMessage`.
8. EOA signatures and off-chain EIP-1271 combined signature bytes MUST be sent unchanged. Vortex MUST NOT hash, split, recover, reorder, or assemble smart-wallet owner signatures. The wallet integration owns signature assembly; Monerium owns `isValidSignature` verification.
9. Address results MUST preserve `201` immediate success and `202` pending on-chain verification. IBAN creation MUST preserve `202` provisioning and `304` already-provisioned semantics. Order creation MUST preserve `200` placed and `202` pending semantics.
10. SEPA redemption messages MUST bind currency, exact amount, recipient IBAN, and an RFC3339 minute timestamp no more than five minutes old. Only the full normalized IBAN or its deterministic first-four/last-four shortened form is valid.
11. Redemption orders of EUR 15,000 or more MUST include `supportingDocumentId`. Uploads MUST remain PDF/JPEG, at most 5 MB, with filenames no longer than 100 characters.
12. Webhook subscription secrets MUST contain 24-64 random bytes encoded as documented, callback URLs MUST use HTTPS, and event types MUST stay within the consumed Monerium enum.
13. Live contract mutations MUST target exactly `https://api.monerium.dev` and remain independently opt-in. An order contract test MUST NOT run from credentials alone because it can move sandbox EURe.
14. New SEPA/EUR BUY quotes MUST resolve only to the Polygon Monerium flow. New EUR SELL quotes MUST return a public `400` and MUST NOT fall back to a Mykobo flow.
15. Production startup MUST fail without a Monerium auth-code client ID, exact callback URI, `MONERIUM_WHITELABEL_CLIENT_ID`, `MONERIUM_WHITELABEL_CLIENT_SECRET`, and explicit non-negative `MONERIUM_ISSUE_FEE_EUR`. The issue fee MUST NOT silently default to zero. Credentials MUST NOT be accepted from client requests.
16. Issue registration MUST derive the Monerium profile UUID from the authenticated effective user's canonical legal entity and approved provider customer. It MUST reject caller-supplied profile, address, or IBAN identity, perform no IBAN mutation, and accept exactly one provider-returned IBAN whose valid EVM address matches an address linked to Polygon on that profile. Because the self-transfer uses an EOA-signed ERC-2612 permit, registration MUST reject a destination with deployed contract code. It MUST read and persist the owner's Polygon EURe balance baseline; inability to obtain an authoritative baseline fails registration. Quote simulation MUST perform no Monerium API or authentication read.
17. Self-transfer registration MUST copy only owner, token, chain, and amount from trusted `monerium-issue` facts and MUST reject an owner that is also the EVM ephemeral. Its EURe permit and exact `transferFrom` MUST be independently validated and reconciled; strict presign completeness MUST require both the user-signed permit and ephemeral-signed transfer. A still-current permit MUST be consumed even when allowance already exists, while an advanced nonce or expired deadline may prove it non-replayable. Permit and transfer hashes MUST remain in namespaced block state, and successful execution MUST verify receipts and the exact allowance reduction.
18. The Polygon conversion MUST verify the pinned pool's tokens, fee, and factory and verify that the pinned factory, router, and quoter resolve to that deployment before quoting or execution. It MUST quote and execute exact-input EURe-to-USDC only, approve only the exact input, bind the swap recipient to the ephemeral, enforce the standard AMM hard minimum and soft execution threshold, validate both raw signed transactions against their unsigned blueprints and route semantics, verify successful receipts, and reconcile the post-swap allowance and output balance. Polygon USDC fee distribution and post-swap subsidy MUST use the existing configured fee recipients and EVM funding account respectively; neither may substitute the Monerium owner or ephemeral as a treasury destination.
19. Issue execution MUST wait for `currentOwnerBalance >= persistedBaseline + quotedPostFeeEureRaw`. Timeouts and exhausted RPC reads are recoverable. Missing or malformed settlement facts are unrecoverable corruption. The executor MUST transfer only the quoted post-fee amount; excess EURe remains in the owner wallet. This non-deterministic attribution exception is accepted only under RISK-023.
20. The owner permit expires 24 hours after transaction preparation. An expired permit or consumed nonce MUST stop automatic self-transfer unless a sufficient safe allowance remains; the API MUST NOT fabricate or broaden authorization. The absence of automatic reauthorization/recovery is accepted under RISK-024.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| White-label credential disclosure | A provider error echoes a secret, token, signature, or profile data | The client never logs bodies and replaces upstream/transport response bodies with a fixed redacted value |
| Token stampede | Concurrent requests receive a delayed `401` and repeatedly request tokens | Token acquisition is coalesced and a rejected token is cleared only if it is still the active cached token |
| Provider hangs | Monerium does not respond | Every provider fetch has an explicit 10-second abort timeout |
| Provider contract drift | Monerium renames a consumed field or changes an enum/status body | Runtime schemas reject malformed successes and the API contract suite exercises the same schemas |
| Smart-wallet proof corruption | Vortex hashes or reassembles Safe owner signatures differently from the wallet contract | Combined off-chain EIP-1271 bytes are opaque; the exact fixed message and hex-byte envelope are validated, then sent unchanged |
| Signed-order substitution | Amount, IBAN, or timestamp differs between the signature and submitted order | Request validation binds the exact documented message to the request fields before transmission |
| Production test mutation | A live contract check links a wallet or submits an order against real money | Every mutation asserts the exact sandbox origin and requires its own explicit run flag |
| Accidental contract-test settlement | A routine live check submits a signed redemption | Every persistent or value-moving sandbox flow has its own explicit `MONERIUM_CONTRACT_RUN_*` gate |
| Balance-delta misattribution | An unrelated or duplicate EURe credit increases the linked owner's balance enough to satisfy a ramp | Accepted under RISK-023: the executor advances on the persisted balance delta, then transfers only the quoted amount. No claim of deterministic SEPA-order correlation is made; excess remains with the owner. |
| Permit becomes unusable before settlement | SEPA settlement arrives after the 24-hour permit deadline or after its nonce is consumed | Accepted under RISK-024: execution proves the permit unusable and stops rather than broadening authorization; manual resolution is required when no sufficient allowance remains. |
| Polygon swap route substitution | A stale or malicious endpoint points the conversion at a different pool, token, fee tier, router, or recipient | Deployment checks pin the pool/factory/router/quoter relationships; quote metadata and signed calldata are validated against constants, exact amounts, the ephemeral recipient, and bounded fee fields before broadcast |

## Audit Checklist

- [x] White-label authentication uses form-encoded `client_credentials`; access tokens are coalesced, memory-only, and retried once after `401`.
- [x] White-label requests use API v2, encoded parameters, 10-second abort signals, and redacted structured provider errors.
- [x] Successful profile, address, IBAN, order, file, and webhook responses are validated before return.
- [x] Address linking preserves externally assembled EIP-1271 signature bytes and the documented `201`/`202` distinction.
- [x] IBAN and order methods preserve documented `304`/`202` semantics; signed SEPA messages and the EUR 15,000 evidence threshold are validated before submission.
- [x] Monerium wire schemas have shared unit coverage and an environment-gated API sandbox contract suite; mutating probes are separately opt-in.
- [x] Contract-test mutations refuse production and non-root sandbox URLs.
- [x] Production configuration requires the auth-code client ID, exact callback URI, white-label credential pair, and explicit non-negative issue fee.
- [x] Issue simulation is auth-free and fee-injected; registration derives an approved profile and exactly one existing Polygon EOA IBAN/address match, rejects contract wallets, and persists the owner's EURe baseline.
- [x] Issue execution waits recoverably for the owner's EURe balance to increase by the quoted post-fee amount and documents the accepted non-deterministic attribution limitation.
- [x] Self-transfer preparation binds an owner permit and ephemeral exact `transferFrom`; execution consumes or proves the permit non-replayable and reconciles both operations independently.
- [x] Polygon conversion verifies the pinned EURe/USDC Uniswap V3 deployment, quotes exact input, prepares exact approval and `exactInputSingle` transactions, validates their signed semantics, and reconciles allowance, receipt, and output thresholds.
- [x] The complete Polygon-to-destination topology is cataloged for supported non-Polygon EVM outputs; Mykobo definitions are legacy-recovery-only and EUR offramps are rejected.
- [x] Strict transaction completeness requires the user-signed typed-data permit as well as every ephemeral-signed transaction before payment instructions are released.
- [ ] OAuth-to-white-label migration, KYC/KYB lifecycle orchestration, user-to-corridor binding, wallet linking, and other import mechanisms are deferred; their trust boundary, persistence model, and status reconciliation remain TBD.
- [ ] The first-party SDK, dashboard, and widget do not complete the profile-linked owner-wallet signing journey. The active release is direct-API only.
- [ ] A permit collected before SEPA settlement can expire or become stale. If no sufficient allowance remains, the ramp stops for manual resolution; no automatic reauthorization path is implemented (RISK-024).
- [x] The post-issue conversion route is fixed-pool Polygon EURe-to-USDC followed by the regular EVM fee, subsidy, Squid settlement, and destination-transfer blocks.
- [ ] Provider-order correlation is not implemented. The active flow intentionally uses the accepted owner-balance-delta attribution model under RISK-023 instead.
