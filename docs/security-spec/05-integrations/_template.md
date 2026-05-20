# Integration Spec Template

Use this template when adding a new external provider/anchor integration to Vortex. Copy this file, rename it to `{provider-name}.md`, and fill in each section.

---

# {Provider Name}

## What This Does

<!-- 
Describe:
- What this provider does (on-ramp, off-ramp, or both?)
- Which fiat currencies it handles
- Which chains/tokens it interacts with
- Which phase handlers use this provider
- The provider's API authentication method
- Data flow: what goes to the provider, what comes back
-->

**Provider type:** {on-ramp | off-ramp | both}  
**Fiat currencies:** {BRL, EUR, ARS, etc.}  
**Chains involved:** {Moonbeam, Polygon, Stellar, etc.}  
**Phase handlers:** {list the phase handler files that interact with this provider}  
**API auth method:** {API key, OAuth, HMAC signature, etc.}

## Security Invariants

<!--
Numbered, testable properties. Must include at minimum:

1. How API credentials for this provider are stored and rotated
2. How amounts sent to the provider are validated against the quote
3. How provider responses are validated (schema, amount bounds, status codes)
4. How the provider's fee deduction is accounted for in the ramp amount
5. How errors/timeouts from the provider are handled without corrupting ramp state
6. How idempotency is ensured (can the same request be safely retried?)
7. How the provider's webhook/callback (if any) is authenticated
-->

1. **Provider API credentials MUST be stored as environment variables** — Never hardcoded, never in the database.
2. **Amounts sent to the provider MUST match the quote** — The amount passed to the provider API must be derived from the ramp's stored quote, not recalculated or taken from user input.
3. **Provider responses MUST be validated** — Status codes, amount fields, and transaction IDs must be checked before advancing the phase.
4. **Provider fee deduction MUST be pre-accounted** — If the provider charges a fee, the quoted output amount must have already factored it in.
5. **Provider errors MUST be recoverable** — Timeouts or 5xx errors from the provider should throw `RecoverablePhaseError`, not corrupt ramp state.
6. **Requests to the provider MUST be idempotent** — If retried, the provider should not double-process. Use idempotency keys if the provider supports them.
7. {Add provider-specific invariants here}

## Threat Vectors & Mitigations

<!--
Include at minimum:

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| Provider API key leak | ... | ... |
| Provider returns manipulated amounts | ... | ... |
| Provider is unavailable | ... | ... |
| Provider webhook spoofing (if applicable) | ... | ... |
| Man-in-the-middle between Vortex and provider | ... | ... |
-->

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **API credential compromise** | Attacker obtains provider API key from env vars | Key rotation; monitor provider dashboard for unauthorized usage |
| **Amount manipulation** | Provider returns a different amount than expected | Validate response amounts against quote; reject deviations beyond tolerance |
| **Provider unavailability** | Provider API is down during a ramp | Phase handler throws `RecoverablePhaseError`; retry with backoff; ramp is not corrupted |
| **Webhook spoofing** | Attacker sends fake provider callbacks | Verify webhook signatures; validate callback source IP if available |
| **TLS downgrade** | MITM intercepts provider communication | Enforce HTTPS; pin certificates if provider supports it |
| {Add provider-specific threats} | ... | ... |

## Audit Checklist

<!--
Include at minimum:

- [ ] Provider API credentials are loaded from env vars, not hardcoded
- [ ] Amounts passed to provider API match the ramp's stored quote amounts
- [ ] Provider response validation: status code checked, amount bounds verified
- [ ] Provider fee is accounted for in the quoted output amount
- [ ] Phase handler uses RecoverablePhaseError for transient provider failures
- [ ] HTTPS is enforced for all provider API calls
- [ ] Idempotency keys are used if the provider supports them
- [ ] Provider webhooks (if any) are signature-verified
- [ ] No provider secrets appear in logs or error messages
- [ ] Timeout is configured for provider API calls
-->

- [ ] Provider API credentials loaded from environment variables
- [ ] Amounts sent to provider derived from stored quote (not recalculated or from user input)
- [ ] Provider response validation includes status code and amount verification
- [ ] Provider fee deduction pre-accounted in quoted amount
- [ ] Phase handler uses `RecoverablePhaseError` for transient failures
- [ ] HTTPS enforced for all provider API calls
- [ ] Idempotency keys used (if provider supports them)
- [ ] Provider webhooks (if any) are signature-verified
- [ ] No provider secrets in logs or error messages
- [ ] Timeout configured for provider API calls
- [ ] {Add provider-specific checks here}
