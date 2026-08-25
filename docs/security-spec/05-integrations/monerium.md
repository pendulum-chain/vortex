# Monerium Integration

## What This Does

`@vortexfi/shared` provides a server-to-server Monerium white-label API client authenticated with
the `client_credentials` grant. It maps profile status, linked addresses, IBAN provisioning and
movement, EURe redemption orders, supporting-document uploads, and webhook subscriptions. Users
interact only with Vortex; all Monerium credentials, tokens, and API calls remain backend-only.

This client establishes the integration baseline for API-managed EU KYC/KYB, wallet ownership,
IBANs, and SEPA/EURe payments. It is not yet connected to a public Vortex route or ramp phase, and
EUR ramp registration remains disabled until that orchestration and its tests are implemented.

## Security Invariants

1. White-label credentials MUST use `MONERIUM_WHITELABEL_CLIENT_ID` and `MONERIUM_WHITELABEL_CLIENT_SECRET`, remain backend-only, and never be accepted from caller input.
2. `MONERIUM_API_URL` MUST use HTTPS. Every authenticated call MUST request API v2, encode dynamic path/query values, and use an explicit 10-second timeout.
3. Authentication MUST send form-encoded `client_credentials`. Access tokens MUST be cached only in memory, coalesced across concurrent requests, renewed before expiry, and reacquired at most once after `401`.
4. Client secrets, access tokens, signatures, request bodies, and raw provider response bodies MUST NOT appear in logs, structured errors, or Vortex API responses. Error endpoint fields MUST use route templates rather than customer identifiers.
5. Successful provider responses MUST be validated against consumed wire schemas. Malformed successful responses MUST surface as contract violations, not trusted typed values or provider-availability errors.
6. Profile kinds and states MUST preserve Monerium's documented values. A profile UUID MUST remain bound to the correct Vortex legal entity when orchestration is added.
7. The wallet-ownership message MUST remain exactly `I hereby declare that I am the address owner.` Callers SHOULD obtain it through `buildMoneriumWalletLinkMessage`.
8. EOA signatures and off-chain EIP-1271 combined signature bytes MUST be sent unchanged. Vortex MUST NOT hash, split, recover, reorder, or assemble smart-wallet owner signatures. The wallet integration owns signature assembly; Monerium owns `isValidSignature` verification.
9. Address results MUST preserve `201` immediate success and `202` pending on-chain verification. IBAN creation MUST preserve `202` provisioning and `304` already-provisioned semantics. Order creation MUST preserve `200` placed and `202` pending semantics.
10. SEPA redemption messages MUST bind currency, exact amount, recipient IBAN, and an RFC3339 minute timestamp no more than five minutes old. Only the full normalized IBAN or its deterministic first-four/last-four shortened form is valid.
11. Redemption orders of EUR 15,000 or more MUST include `supportingDocumentId`. Uploads MUST remain PDF/JPEG, at most 5 MB, with filenames no longer than 100 characters.
12. Webhook subscription secrets MUST contain 24-64 random bytes encoded as documented, callback URLs MUST use HTTPS, and event types MUST stay within the consumed Monerium enum.
13. Live contract mutations MUST target exactly `https://api.monerium.dev` and remain independently opt-in. An order contract test MUST NOT run from credentials alone because it can move sandbox EURe.
14. No public route or ramp phase may rely on this client until ownership checks, persistence, webhook verification, idempotency, and end-to-end corridor tests are implemented.

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

## Audit Checklist

- [x] White-label authentication uses form-encoded `client_credentials`; access tokens are coalesced, memory-only, and retried once after `401`.
- [x] White-label requests use API v2, encoded parameters, 10-second abort signals, and redacted structured provider errors.
- [x] Successful profile, address, IBAN, order, file, and webhook responses are validated before return.
- [x] Address linking preserves externally assembled EIP-1271 signature bytes and the documented `201`/`202` distinction.
- [x] IBAN and order methods preserve documented `304`/`202` semantics; signed SEPA messages and the EUR 15,000 evidence threshold are validated before submission.
- [x] Monerium wire schemas have shared unit coverage and an environment-gated API sandbox contract suite; mutating probes are separately opt-in.
- [x] Contract-test mutations refuse production and non-root sandbox URLs.
- [ ] Public white-label onboarding and ramp orchestration are not implemented; ownership, persistence, webhook verification, idempotency, and corridor coverage remain required before exposure.
