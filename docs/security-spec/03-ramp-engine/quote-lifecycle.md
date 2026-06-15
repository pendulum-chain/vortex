# Quote Lifecycle

## What This Does

Quotes are the entry point for every ramp. A quote calculates the expected output amount for a given input, factoring in exchange rates, fees, and dynamic pricing adjustments. The lifecycle:

1. **Creation** — Client requests a quote via `POST /v1/quotes` with input currency, output currency, amount, and ramp direction (`BUY` for on-ramp or `SELL` for off-ramp). If an active maintenance window exists, the backend rejects quote creation with `503 Service Unavailable`, `Retry-After`, and downtime start/end metadata before fetching rates or writing a quote. Otherwise, the API calculates fees, fetches live exchange rates (Nabla DEX, price providers), applies the dynamic pricing adjustment, and returns a `QuoteResponse` including the expected output amount, fee breakdown, and a quote ID.
   - If live route/pool liquidity cannot serve the quote at the requested amount, the API returns a user-facing `500` quote error (`This route is temporarily unavailable due to low liquidity. Please try a smaller amount or check back soon.`). Clients should treat it as a user-correctable liquidity failure and ask for a smaller amount or to check back soon. This applies to Nabla pool coverage failures, Squid route low-liquidity responses, and `/v1/quotes/best` when every candidate route fails for liquidity. Unexpected provider or calculation failures still follow the global production error policy and are masked as internal errors.
2. **Expiry** — Quotes expire **10 minutes** after creation (hardcoded in `QuoteTicket.create()` and the model default: `new Date(Date.now() + 10 * 60 * 1000)`). After expiry, the quote cannot be used to start a ramp. Note: this is a separate timeout from `discountStateTimeoutMinutes` (see Dynamic Pricing below).
3. **Binding** — When a ramp is registered (`POST /v1/ramp/register`), it binds to a specific quote ID. The quote's amounts become the committed values for the ramp.
4. **Consumption** — A quote can only be bound to one ramp. Once consumed, it cannot be reused.

### Dynamic Pricing System ("Discount Engine")

The platform uses a per-partner dynamic pricing mechanism to adjust the offered rate based on partner quoting behavior. The system is designed to reward partners who quote-but-don't-convert (improving their rate) and slightly worsen the rate for partners who consistently convert (since the platform bears subsidization risk).

**Key variables:**
- `deltaDBasisPoints` (config, default `0.3`) — The step size for each rate adjustment, in basis points. Converted to a decimal: `0.3 / 10000 = 0.00003`.
- `discountStateTimeoutMinutes` (config, default `10`) — The inactivity window. If a partner's last quote is **older** than this timeout, the system considers it "inactive" and adjusts the rate on the next quote.
- `targetDiscount` (per-partner, DB) — The partner's base discount rate (from the `partners` table).
- `minDynamicDifference` (per-partner, DB) — Lower bound for the dynamic adjustment (can be negative).
- `maxDynamicDifference` (per-partner, DB) — Upper bound for the dynamic adjustment.

**How it works:**

The system maintains an **in-memory** `Map<partnerId, { difference: Big, lastQuoteTimestamp: Date | null }>` called `partnerDiscountState`.

1. **On each quote request** (`getAdjustedDifference`):
   - If no state exists for the partner → initialize with `difference = 0`, return `0`.
   - If the last quote was **within** the timeout window → return the current `difference` unchanged.
   - If the last quote was **outside** the timeout window (partner was quoting but not converting) → **increase** `difference` by `deltaD` (= `deltaDBasisPoints / 10000`), clamped at `maxDynamicDifference`. This **improves** the rate for the partner.

2. **On quote consumption** (ramp registration, `handleQuoteConsumptionForDiscountState`):
   - If the last quote was **within** the timeout window → **decrease** `difference` by `deltaD`, clamped at `minDynamicDifference`. This **worsens** the rate slightly. The `lastQuoteTimestamp` is set to `null`.
   - If the last quote was **outside** the timeout window → no change (the state already timed out).

3. **Rate application** (`calculateExpectedOutput`):
   - `adjustedTargetDiscount = targetDiscount + difference`
   - `discountedRate = effectivePrice × (1 + adjustedTargetDiscount)`
   - `expectedOutput = inputAmount × discountedRate`

**Partner resolution:** Quote ownership and pricing attribution are separate. Explicit partner API-key requests remain partner-owned through `partner_id`; authenticated frontend quotes remain user-owned through `user_id`. Pricing can come from an explicit partner, a validated public-key partner, a profile assignment's ramp-specific `buy_partner_id` / `sell_partner_id`, or the default `"vortex"` partner. When non-default partner pricing applies, `pricing_partner_id` records the partner row used for fees, subsidy, fee distribution, and dynamic discount state.

**Subsidy calculation:** After computing the expected output (oracle-based) and actual output (DEX-based), the shortfall is the "ideal subsidy." This is capped by `partner.maxSubsidy` (as a fraction of expected output). The subsidy is only applied if `targetDiscount > 0`.

### AlfredPay Provider Quote TTL

AlfredPay's upstream provider quote is short-lived (~30 seconds) — much shorter than the Vortex 10-minute quote expiry. To keep the two reconciled:

1. **At quote time** (`OnRampAlfredpayDiscountEngine` / `OfframpTransactionAlfredpayEngine`): the platform calls the AlfredPay provider, stores the provider `quoteId` and amounts in `ctx.alfredpayOnramp` / `ctx.alfredpayOfframp`, and freezes them in the Vortex quote metadata.
2. **At ramp registration / prep time** (`refreshAlfredpayOnrampQuoteIfMatching` / `refreshAlfredpayOfframpQuoteIfMatching` in `ramp.service.ts`): the API re-fetches a fresh AlfredPay provider quote.
   - **On-ramp:** If the new provider response is byte-identical on `toAmount` and `fee` to the stored values, the platform substitutes the new provider `quoteId` so the downstream mint/transfer hits an unexpired provider quote. If amounts diverge, the original `quoteId` is kept and downstream handlers may fall back (see `alfredOnrampMintFallback`).
   - **Off-ramp:** `refreshAlfredpayOfframpQuoteIfMatching` compares `toAmount` and `fee` exactly. If identical, the new `quoteId` and `expirationDate` are written to quote metadata within the registration transaction. If amounts diverge, the method throws `INTERNAL_SERVER_ERROR`, aborting ramp registration entirely — unlike the on-ramp fallback path, the off-ramp does NOT proceed with a stale quote at prep time.
3. **Offramp expired-quote recovery** (`alfredpay-offramp-transfer-handler.ts`): if the provider rejects the stored `quoteId` as expired at execute time (post-registration), the handler requests a fresh provider quote and reattempts.

The refresh policy is intentionally strict (byte-identical `toAmount` and `fee` only). Any drift in amounts forces the on-ramp into the fallback path (bounded by the discount engine's `expectedOutput` and the partner's `maxSubsidy`) or aborts off-ramp registration.

## Security Invariants

1. **Quotes MUST expire** — A quote older than 10 minutes MUST be rejected when a ramp attempts to bind to it. The expiry is checked via `quote.expiresAt < new Date()` at registration time. Exchange rates change; stale quotes expose the platform to unfavorable rates.
2. **Each quote MUST be consumable exactly once** — After a quote is bound to a ramp, it MUST NOT be reusable for another ramp. This prevents a single favorable quote from being exploited multiple times.
3. **Quote amounts MUST be immutable after creation** — Once a quote is stored, its `inputAmount`, `outputAmount`, fee breakdown, and exchange rate MUST NOT be modifiable. The ramp uses these exact values.
4. **The quoted output amount MUST be the guaranteed minimum the user receives** — The platform subsidizes eligible shortfalls between the actual swap result and the quoted amount (up to the applicable subsidy caps). On EVM post-swap routes, the top-up may be split into an actual-vs-quoted swap-output discrepancy component and a quote-time discount component; each is bounded independently by env-configured runtime caps. The user MUST NOT receive less than the quoted output (after fees) unless a cap breach leaves the ramp waiting for operator intervention.
5. **Fee calculations MUST be deterministic for the same inputs** — Given the same input amount, currencies, ramp direction, and fee configuration, the quote MUST produce the same fee breakdown. Non-deterministic fees create audit and reconciliation gaps. Note: the dynamic pricing adjustment (`difference`) adds intentional variability to the *rate*, not the *fees*.
6. **Quote validation MUST occur at ramp registration time** — When binding a quote to a ramp, the API MUST verify: quote exists, quote is not expired, quote is not already consumed, and the requesting user/partner is authorized to use it.
7. **Dynamic pricing `difference` MUST be clamped to partner bounds** — The `difference` value must never exceed `maxDynamicDifference` or fall below `minDynamicDifference`. Both bounds are enforced in `getAdjustedDifference` and `handleQuoteConsumptionForDiscountState`.
8. **Dynamic pricing state MUST NOT be externally modifiable** — The `partnerDiscountState` Map is in-memory and module-private. No API endpoint should expose or allow modification of discount state.
9. **Exchange rates MUST be sourced from authoritative on-chain data** — Swap rates should come from the actual DEX (Nabla) or routing protocol (Squid), not from stale caches or third-party price feeds that could be manipulated.
10. **Subsidy MUST only be applied when `targetDiscount > 0`** — If a partner has no target discount configured, the subsidy amount is always `0`, regardless of the shortfall.
11. **Quote output precision MUST match the final settlement token** — For EVM onramps whose final output comes from Squid, the stored `quote.outputAmount` must retain the destination token's precision, not a fixed source-token precision. This includes BRL/EURC Base→EVM routes and routed Alfredpay USD/MXN/COP Polygon→EVM routes. Direct same-chain same-token passthrough keeps the minted/source token's precision.
12. **Quote creation MUST honor active maintenance windows server-side** — `POST /v1/quotes` and `POST /v1/quotes/best` must reject during active maintenance before quote calculation/persistence, including enough downtime metadata for direct API clients to retry after the window.
13. **Quote ownership MUST stay separate from pricing attribution** — Profile-assigned quotes MUST remain user-owned (`user_id = req.userId`, `partner_id = NULL`) while storing the applied partner pricing row in `pricing_partner_id`.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **Stale quote exploitation** | Attacker creates a quote when rates are favorable, waits for rates to move against the platform, then registers a ramp at the old rate | Quote expiry (10 minutes hardcoded); quote-time discount subsidy is bounded by partner `maxSubsidy`, and EVM post-swap runtime subsidy components are bounded by their own env-configured caps before funds move. |
| **Quote replay** | Attacker uses the same favorable quote ID for multiple ramps | One-time consumption: quote status is set to `"consumed"` on ramp registration; second attempt is rejected (`quote.status !== "pending"`) |
| **Quote manipulation** | Attacker modifies quote amounts in transit or in database | Quotes stored server-side; amounts calculated server-side from authoritative sources; client cannot override amounts |
| **Price oracle manipulation** | Attacker manipulates the DEX price before requesting a quote to get an artificially favorable rate | Use TWAP or multi-source pricing; bound acceptable deviation from reference rates; monitor for unusual quote patterns |
| **Dynamic pricing farming** | Attacker rapidly requests quotes without consuming them to push `difference` toward `maxDynamicDifference`, then consumes at the best possible rate | Each quote request within the timeout window does NOT change the difference — only quotes **after** the timeout increase it. So the attacker would need to wait `discountStateTimeoutMinutes` between each step increase. With default `deltaD = 0.00003` and a 10-minute timeout, farming is slow. However, the `maxDynamicDifference` cap is the hard limit. |
| **⚠️ In-memory state loss** | Server restart resets all partner discount states to `difference = 0`. Partners lose their accumulated rate adjustments. | **NO MITIGATION.** State is in-memory only. After restart, all partners start fresh. This could cause abrupt rate changes if a partner had a significant accumulated difference. |
| **Subsidization abuse** | Attacker creates quotes during high volatility, forcing the platform to cover large subsidization amounts | Quote-time discount subsidy is capped by `maxSubsidy` per partner; EVM runtime top-ups are separately bounded by the pre/post-swap cap fractions; dynamic pricing adjusts rates over time; `maxDynamicDifference` bounds the maximum rate improvement |
| **Unauthorized quote consumption** | Attacker binds someone else's quote to their own ramp | Quotes carrying an owner (`partner_id` or `user_id`) are bound to that owner; ownership is verified at ramp registration via `assertQuoteOwnership`. `pricing_partner_id` is not an ownership credential. Fully-anonymous quotes (no `partner_id` and no `user_id`) are intentionally consumable by any caller — they cannot leak privileged data because they were created without a principal in the first place. |
| **Pricing partner treated as owner** | A profile-assigned user receives partner pricing, then tries to access partner-owned quotes or ramps. | Profile assignments populate `pricing_partner_id` only; `partner_id` stays `NULL`, so ownership guards continue to authorize through the Supabase `user_id` path. |
| **Negative `minDynamicDifference`** | If `minDynamicDifference` is set to a large negative value in the partner DB record, consuming quotes could push the rate below the base `targetDiscount`, potentially making the effective discount negative (user receives less than the oracle rate) | DB constraint: `minDynamicDifference` defaults to `0`. However, there is no DB-level CHECK constraint preventing negative values. If set manually, the clamping logic would allow `difference` to go negative. |
| **Concurrent quote and consumption** | Two simultaneous requests — one quoting, one consuming — for the same partner could read stale `difference` values from the in-memory Map | JavaScript's single-threaded event loop prevents true concurrency for synchronous Map operations. However, the `async` functions in `compute()` could interleave if there are `await` points between reading and writing the Map. In practice, the read and write of `partnerDiscountState` in `getAdjustedDifference` are synchronous, so this is safe within a single process. |
| **Quote-output precision loss** | A quote targets an 18-decimal destination token but stores only 6 decimal places. The user-visible amount looks close, but final raw transfer construction under-delivers by the truncated dust amount. | Finalize EVM onramp quotes with destination token decimals when the final amount comes from Squid; tests should cover 6-decimal source → 18-decimal destination routes. |
| **Direct API quote creation during planned downtime** | A partner bypasses the UI maintenance banner and requests quotes directly while operators expect Vortex services to be unavailable. | Quote creation routes run the backend maintenance guard and return `503` with `Retry-After`, `maintenance_start`, and `maintenance_end` before any quote is persisted. |

## Audit Checklist

- [x] Quote creation endpoint calculates all fee components server-side — no fee amounts accepted from the client. **PASS** — verified: all fee calculations happen in `calculateFeeComponents()` and token-config helpers; no fee fields accepted from request body.
- [x] Quote expiry is hardcoded to 10 minutes (`new Date(Date.now() + 10 * 60 * 1000)`) in the finalize engine — verify this is appropriate and cannot be overridden by client input. **PASS** — verified in `QuoteTicket.create()` and model default.
- [x] Verify `discountStateTimeoutMinutes` (default 10 min) controls discount state inactivity, **NOT** quote expiry — these are separate timeouts that happen to share the same default. **PASS** — confirmed: separate code paths, separate purposes.
- [x] Quotes are marked as consumed atomically with ramp creation — verify `consumeQuote` and `handleQuoteConsumptionForDiscountState` are called within the same transaction boundary. **PASS** — both called during ramp registration flow.
- [x] `deltaDBasisPoints` (default 0.3) step size is reasonable — verify `0.3 / 10000 = 0.00003` per step is the intended rate adjustment granularity. **PASS** — confirmed in code; granularity appropriate for gradual rate adjustment.
- [N/A] `maxDynamicDifference` and `minDynamicDifference` are set to reasonable values for all partners in the database — check the "vortex" default partner especially. **N/A** — requires database inspection, not a code audit item.
- [EXISTING FINDING] **FINDING F-012**: Dynamic pricing state is in-memory only (`partnerDiscountState` Map) — lost on server restart. Verify this is acceptable or if persistence is needed. **EXISTING FINDING** — documented as F-012.
- [N/A] Verify `minDynamicDifference` cannot be set to a dangerously negative value in the partners table — no DB CHECK constraint exists. **N/A** — requires database schema review, not a code audit item.
- [N/A] Verify `maxDynamicDifference` cannot be set to an unreasonably high value that would cause excessive subsidization. **N/A** — requires database schema review, not a code audit item.
- [x] Exchange rates used in quote calculation come from live on-chain sources (Nabla, Squid), not stale caches. **PASS** — verified: rates fetched from Nabla DEX and SquidRouter API at quote time.
- [x] Quote response does not include internal implementation details (e.g., the `adjustedDifference` or `adjustedTargetDiscount` values). **PASS** — verified: response includes only user-facing fields (amounts, fees, expiry).
- [x] Quote amounts (input, output, fees) are immutable once stored — no UPDATE endpoint modifies them. **PASS** — no quote mutation endpoints exist.
- [x] EVM onramp output precision follows destination token decimals where the quote output comes from Squid. **PASS** — BRL/EURC Base→EVM and routed Alfredpay USD/MXN/COP Polygon→EVM finalization preserve destination token precision before downstream raw transfer construction. Direct same-chain same-token passthrough remains at minted/source-token precision.
- [PARTIAL] Authentication is enforced on quote creation (verify which auth mechanisms protect `POST /v1/ramp/quotes`). **PARTIAL** — quote creation is accessible via API key auth or Supabase auth; the endpoint is optional-auth by design (public quotes allowed for some partners).
- [PARTIAL] Quote ownership is verified at ramp registration — the user/partner creating the ramp must match the quote creator. **PARTIAL** — no strict user-to-quote binding; mitigated by UUID unpredictability and 10-minute expiry.
- [x] Profile-assigned quote pricing persists `pricing_partner_id` without granting partner ownership. **PASS** — profile-assigned quotes store `user_id`, leave `partner_id` `NULL`, and authorize through the user ownership path.
- [x] Subsidy is only calculated when `targetDiscount > 0` — partners with no discount get `0` subsidy regardless of shortfall. **PASS** — verified in `calculateSubsidyAmount()`.
- [x] `calculateSubsidyAmount` correctly caps at `maxSubsidy × expectedOutput` — verify the multiplication is the right semantic (fraction of expected, not absolute). **PASS** — confirmed: `maxSubsidy` is a fraction (0-1) multiplied by `expectedOutput`.
- [x] The `resolveDiscountPartner` fallback to the `"vortex"` default partner is intentional — verify the default partner exists and has appropriate discount/subsidy settings. **PASS** — fallback to "vortex" partner confirmed in code when no active pricing partner applies.
- [N/A] Monitoring exists for quotes with unusually high subsidization requirements. **N/A** — no monitoring infrastructure audited.
- [x] **FINDING F-059 (HIGH)**: Verify `registerRamp` acquires `SELECT FOR UPDATE` lock on the quote, checks `consumeQuote` affected rows, and has a unique constraint on `rampState.quoteId` to prevent double-binding. **PASS (FIXED)** — lock added, affected rows checked, unique constraint migration `026` created.
- [x] Verify active maintenance windows block `POST /v1/quotes` and `POST /v1/quotes/best` server-side with client-actionable downtime metadata.
