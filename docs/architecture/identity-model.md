# Identity, Customer, and Partner Model

Status: current architecture. Last reconciled with migrations 038–054 and the API models
on 2026-07-31.

This document explains the implemented identity model across authentication, compliance
customers, provider accounts, partner pricing, and recipients. Security invariants remain
owned by [`docs/security-spec/`](../security-spec/README.md).

## Design principles

- A login profile is not a legal or compliance identity.
- Every provider account and KYC/KYB case belongs to one customer entity.
- Partner identity is separate from per-direction and per-currency pricing.
- Ramp registration operates for an effective user; provider identity is resolved by the
  server and is never selected freely by request data.
- Reusable payout details stay with the provider. Vortex stores provider references and
  masked labels, not raw bank-account data.

## Core model

```mermaid
erDiagram
    profiles ||--o{ customer_entities : owns
    profiles ||--o{ api_keys : may_own
    customer_entities ||--o{ provider_customers : owns
    customer_entities ||--o{ kyc_cases : verifies
    provider_customers ||--o{ kyc_cases : has
    partners ||--o{ partner_pricing_configs : prices
    partners ||--o{ api_keys : attributes
    customer_entities ||--o{ recipient_invitations : sends
    customer_entities ||--o{ sender_recipients : participates
    sender_recipients ||--o{ recipient_payout_references : uses
```

### Profiles and customer entities

`profiles` is the Supabase-linked login identity. Email OTP authentication yields a
Supabase user ID, which is also the profile ID used by the API.

`customer_entities` represents the legal/compliance customer. A profile may own an
individual and a business entity, while `profiles.active_customer_entity_id` records the
dashboard's selected sender identity. Selection is ownership-checked and currently
immutable after it is set. Compliance records may outlive a deleted profile because the
profile foreign key is nullable.

### Provider customers and verification cases

`provider_customers` is the durable account at Avenia, Alfredpay, Mykobo, or Monerium. It
belongs to exactly one customer entity and stores provider identifiers, corridor data,
customer type, normalized verification status, and only the provider-specific identity
fields required by runtime behavior.

`kyc_cases` records KYC/KYB attempts separately from the provider account. Both tables use
the normalized lifecycle `started`, `pending`, `in_review`, `approved`, or `rejected`,
while `status_external` preserves a provider's original value when one exists.

Avenia is the one current exception to the general preference against retaining raw tax
references: `provider_customers.tax_reference` remains a runtime join key for in-flight
ramp state. Its SHA-256 value backs lookup and uniqueness; masked display is derived at
read time rather than stored as a second copy.

### Partners, pricing, and API keys

`partners` contains one commercial identity per unique partner name.
`partner_pricing_configs` contains the BUY/SELL pricing rows, optionally scoped to a fiat
currency; a currency-specific row takes precedence over the wildcard row.

API keys have two independent axes:

- `partner_id` supplies commercial attribution and partner pricing;
- `user_id` identifies the profile the key may act for.

Public `pk_*` keys are stored as public values and are suitable for attribution. Secret
`sk_*` keys are stored as hashes and may authenticate requests. A partner-only key may
quote but cannot register a ramp for an arbitrary customer; registration requires either
a Supabase user or a secret key linked to one user. See
[`ADR 0001`](../decisions/0001-user-gated-ramp-registration.md).

### Recipients

`recipient_invitations` contains a token-bound invitation from a sender entity.
`sender_recipients` is the accepted sender-to-recipient relationship, scoped per rail.
`recipient_payout_references` contains the provider-side payout instrument ID, masked
label, and verification status.

The detailed redemption, token-retention, authorization, and payability rules are
normative in
[`security-spec/03-ramp-engine/recipient-transfers.md`](../security-spec/03-ramp-engine/recipient-transfers.md).
Current product behavior and acknowledged gaps are in
[`product/dashboard.md`](../product/dashboard.md).

## Authentication and ownership flow

1. `requirePartnerOrUserAuth()` accepts a valid secret API key or Supabase bearer token.
2. `getEffectiveUserId()` prefers the Supabase user and otherwise uses the user linked to
   the validated secret key.
3. Ownership middleware scopes quotes, ramps, provider accounts, recipients, and history
   to that effective user and their customer entities.
4. At ramp registration, the server resolves the provider account for the effective user.
   Client-supplied provider identifiers are either ignored or accepted only when they
   match the server-derived identity.

Quotes remain available before login where the public API permits rate discovery. An
authenticated user may claim an anonymous quote at registration; an already user-owned
quote cannot be claimed by another user.

## Implementation map

- Sequelize models: `apps/api/src/models/{user,customerEntity,providerCustomer,kycCase,partner,partnerPricingConfig,apiKey,recipientInvitation,senderRecipient,recipientPayoutReference}.model.ts`
- Principal resolution: `apps/api/src/api/middlewares/{dualAuth,effectiveUser,ownershipAuth}.ts`
- Provider ownership resolution: `apps/api/src/api/services/avenia-account.ts` and provider controllers/services
- Schema history: `apps/api/src/database/migrations/038-*` onward
- Security details: `docs/security-spec/01-auth/`, `03-ramp-engine/recipient-transfers.md`, and the provider specs under `05-integrations/`

Update this document only when the cross-module shape changes. Provider-specific flows,
security exceptions, and field-level audit checklists belong in the security spec.
