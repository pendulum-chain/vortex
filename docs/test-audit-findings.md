# Existing-Test Audit Findings (2026-07-05)

Every existing test file was audited for correctness defects; each finding below was
independently re-verified by an adversarial reviewer before being confirmed (5 further
claims were rejected at that stage). Findings marked ✅ were fixed on the
`test-suite-foundation` branch; the rest are catalogued for follow-up.

Severity reflects impact on trustworthiness of the suite, not production risk.

## Remediation status (2026-07-05, branch test-suite-foundation)

Fixed in this branch:
- ✅ All process-wide `mock.module` / singleton patches without restore (maintenanceGuard,
  nabla-swap-handler, squid-router-phase-handler, quote nabla-swap/base-evm, priceFeed.service,
  quote squidrouter/index, ephemeral-freshness, transactions common+avenia-to-evm-base,
  webhook.service, cleanup.worker): real modules are captured as value copies before mocking
  and restored in afterAll.
- ✅ Live integration tests' module-level patching gated behind RUN_LIVE_TESTS.
- ✅ `bun test` no longer discovers stale compiled test copies in dist/ (bunfig test root=src).
- ✅ crypto.test.ts injects keys via the config snapshot instead of inert process.env writes.
- ✅ apiKeyAuth.helpers.test.ts fixture no longer issues live INSERTs (stubbed update()).
- ✅ webhook.service.test.ts validates quoteId against QuoteTicket (was stale RampState mock);
  dead crypto/randomBytes mock removed.
- ✅ dualAuth.test.ts renamed to ownershipAuth.test.ts.
- ✅ cleanup.worker.test.ts neutralizes the CronJob runOnInit cleanup cycle that fired real DB
  queries on construction.
- ✅ webhook-delivery.service.test.ts rewritten against current production behavior (was
  quarantined): real RSA-PSS signing via the cryptoService singleton with a verifySignature
  round-trip, webhookService methods patched on the instance and restored in afterAll (no
  mock.module), per-test fetch stubs with restore, real timers with 1ms backoff. Resolves the
  cannot-fail (line 47), stale-or-dead (line 60), and both wrong-assertion (lines 157, 414)
  findings below.

Fixed in the second remediation pass (2026-07-05):
- ✅ The 6 quarantined EUR-onramp cases in transactions/validation.test.ts rebuilt on the live
  Base BRL-onramp corridor (nablaApprove/squidRouterSwap/destinationTransfer on Networks.Base,
  chainId 8453) and un-skipped; this also exercises the polymorphic nabla-on-Base=EVM mapping
  that broke the old fixture. The cannot-fail "matches a signed EVM transaction..." test was
  deleted (fully subsumed by the neighboring calldata-differences test).
- ✅ clientIp.test.ts: uses a non-loopback request IP (no more real ipify call) and asserts the
  exact normalized value.
- ✅ priceFeed.service.test.ts: "without API key" test now controls the key on the instance and
  asserts absence of the real header (x-cg-pro-api-key), plus a positive-presence companion;
  exported-singleton caches cleared in beforeEach (order-independence); duplicate
  "default values" config test deleted (its env deletion was inert).
- ✅ brla-onramp-hold.test.ts: missing-ticket case asserts updateState was not called instead of
  re-asserting the fixture's initial value.
- ✅ squid-router-phase-handler.test.ts: Monerium fixture uses network=Base (BUY quote.network is
  the destination by construction) and asserts the pre-settlement snapshot on (Base, USDC).
- ✅ ramp.service.register-auth.test.ts: no-effective-user test pins the guard's message so a
  later unrelated 400 can't satisfy it.
- ✅ discount/helpers.test.ts: mislabeled "negative targetDiscount (rate floor)" block replaced
  with genuine calculateExpectedOutput coverage (negative/positive discount, offramp inversion).
- ✅ webhook.service.test.ts: not-found test pins status 404 + message; registration-error test
  resolves the quote so the rejection genuinely comes from Webhook.create (pins 500); orphaned
  randomBytes mock removed.
- ✅ base.service.test.ts: sequelize/QuoteTicket singleton patches restored in afterAll.
- ✅ vars.test.ts: FLOW_VARIANT added to the required production env; subprocesses run with
  cwd=os.tmpdir() so the developer's .env can no longer backfill missing variables.
- ✅ rebalancer config.test.ts: REBALANCING_DAILY_BRIDGE_LIMIT_USD added to the scrubbed env list.
- ✅ phase-processor.onramp.integration.test.ts: registerRamp now passes a userId, ephemeral keys
  renamed to EVM/Substrate (they were silently dropped before), updateRamp reordered before
  startRamp, vestigial ../brla/helpers mock deleted.
- ✅ phase-processor.recovery.integration.test.ts: loads the fixture from
  failedRampStateRecovery.json with fail-fast validation, and polls currentPhase asserting
  "complete" instead of an unconditional 50-minute sleep with zero expects.
- ✅ xcm/assethubToMoonbeam: dry-run test now asserts the Result is Ok and local execution
  succeeded; the inert assetAccountKey parameter was dropped from the production function
  (the asset is hardcoded to USDT on AssetHub).
- 🗑 xcm/moonbeamToAssethub.test.ts deleted: it targeted
  createMoonbeamToAssethubTransferWithSwapOnHydration, whose own doc comment says the resulting
  XCM cannot work on Moonbeam; the dead production function was left in place (flagged, not removed).
- 🗑 frontend phaseFlows.test.ts deleted: it compared PHASE_FLOWS to a verbatim copy of itself
  (typos are already caught at compile time by the `as RampPhase[]` casts; backend parity was
  never actually checked).
- 🗑 frontend translations/helpers.test.ts "Extensibility Example" block deleted: both tests
  asserted properties of local objects they had just built; the real extraction path stays
  covered by the getBrowserLanguage tests.

Skipped with pointer (blocked on a product decision, not fixable in tests):
- ⏸ The two Mykobo EUR registration contract tests (mykobo-eur-offramp/onramp
  .integration.test.ts) are it.skip'd: registerRamp unconditionally rejects EURC quotes with
  503 "EUR ramps are currently disabled" (commit be52569e4). Re-enable when EUR ramps return
  or a test bypass for the guard exists.

All findings below are now remediated. The full apps/api suite passes as one process:
317 pass / 12 skip / 0 fail. The tracked frontend suite passes 88/88.


## HIGH

### `apps/api/src/api/middlewares/maintenanceGuard.test.ts:13` — isolation-hazard

Four mock.module() calls (lines 13, 28, 34, 43) replace '../observability/apiClientEvent.service', '../controllers/quote.controller', '../controllers/ramp.controller', and '../services/auth' and are never restored. Bun runs all test files in one process and mock.module replaces the ENTIRE export set for the rest of the process. Verified empirically: after this file runs, sanitizeApiClientEvent and recordApiClientEventSafe become undefined in the module registry, getSafeApiKeyPrefix loses its pk_/sk_ validation (returns a 16-char slice of ANY string), quote/ramp controllers become 418-teapot stubs, and SupabaseAuthService.verifyToken always returns {valid:false}. Concretely, running this file together with src/api/observability/apiClientEvent.service.test.ts makes the latter fail to even load: "SyntaxError: Export named 'sanitizeApiClientEvent' not found in module .../apiClientEvent.service.ts" (reproduced in both CLI orderings; bun executes maintenanceGuard.test.ts first). Any other suite-wide run that includes both files fails. The module-level observedEvents array (line 10) also keeps collecting events from later files' code that calls the mocked observeApiClientEvent.

**Suggested fix:** Capture the real modules with `import * as realSvc from '../observability/apiClientEvent.service'` (etc.) before mocking, and re-register them in afterAll via `mock.module(path, () => realSvc)`. Alternatively avoid mock.module entirely: patch MaintenanceService only (already done) and spy on observeApiClientEvent via a restorable instance/property patch, or move this route-level test into its own isolated process/run.

### `apps/api/src/api/services/phases/handlers/nabla-swap-handler.test.ts:42` — isolation-hazard

mock.module("@vortexfi/shared", ...) replaces the entire shared package process-wide with a stub missing most real exports (FiatToken, AveniaTicketStatus, getOnChainTokenDetails, etc.) and is never restored (no afterAll; bun module mocks persist across test files in the single test process). Empirically demonstrated: all five audited files pass individually, but `bun test` over the phases handler/helper directories in default discovery order fails 2 tests — squid-router-phase-handler.test.ts errors with "Export named 'FiatToken' not found" (its production import chain via quote/utils.ts resolves against this stub) and brla-onramp-hold.test.ts errors with "Export named 'AveniaTicketStatus' not found". The mock.module("../../ramp/ramp.service") at line 77 has the same unrestored-global problem, gutting ramp.service to a default export with only appendErrorLog for every later test file.

**Suggested fix:** Build the mock factory by spreading the actual module and overriding only what the test needs, e.g. `const actual = await import("@vortexfi/shared"); mock.module("@vortexfi/shared", () => ({ ...actual, checkEvmBalanceForToken, EvmClientManager: ... }))`, and do the same for ramp.service, so un-overridden exports (FiatToken, AveniaTicketStatus, ...) remain intact for other files in the process.

### `apps/api/src/api/services/phases/handlers/squid-router-phase-handler.test.ts:62` — isolation-hazard

Same unrestored process-global mock.module("@vortexfi/shared") pattern with an incomplete stub (no AveniaTicketStatus, no real FiatToken values, etc.). Demonstrated pairwise: running this file then brla-onramp-hold.test.ts in one bun process makes brla-onramp-hold.test.ts fail to load ("Export named 'AveniaTicketStatus' not found in module .../packages/shared/dist/node/index.js"), because brla-onramp-hold.ts imports AveniaTicketStatus from @vortexfi/shared and resolves against this stub. This file is also itself a victim of the identical leak from nabla-swap-handler.test.ts: in default discovery order (nabla* sorts before squid*), this file's tests error out entirely with "Export named 'FiatToken' not found", so it cannot pass in a combined run today. mock.module("../../ramp/ramp.service") at line 102 has the same problem.

**Suggested fix:** Spread the actual @vortexfi/shared module in the mock factory and override only the handful of functions the test controls (checkEvmBalanceForToken, EvmClientManager, getEvmBalance, getOnChainTokenDetails, evmTokenConfig), keeping real enums/constants; same for ramp.service.

### `apps/api/src/api/services/phases/mykobo-eur-offramp.integration.test.ts:116` — isolation-hazard

Module-scope monkeypatching without restore, executed on EVERY `bun test` run even when the describe is skipped (describe.skipIf gates only the tests, not top-level code): RampState.update/findByPk/create (116-144), QuoteTicket.findByPk/update/create (146-168), BrlaApiService.getInstance (186), RampRecoveryWorker.prototype.start (188), plus process-global mock.module of ../quote/core/nabla (10) and ../mykobo/mykobo-customer.service (35). Bun runs all test files in one process, so these bleed into later files: mykobo-customer.service.test.ts tests the real resolveMykoboCustomerForUser, which this file replaces with a stub returning mail@test.com; ramp.service.register-auth.test.ts captures QuoteTicket.findByPk as its 'original' in afterEach and would capture and restore the poisoned mock. The file also writes lastRampStateMykoboEur.json into the src tree on every model write (gitignored/documented, but still a repo-dir side effect).

**Suggested fix:** Move all patching into beforeAll inside the skipIf-gated describe, capture originals, and restore them (and the module mocks) in afterAll.

### `apps/api/src/api/services/phases/phase-processor.onramp.integration.test.ts:191` — stale-or-dead

registerRamp is called without userId and the quote is created without a user, so effectiveUserId resolves to undefined and registerRamp always throws 'Invalid quote: this route requires an API key linked to a user or Supabase user authentication.' (ramp.service.ts:216-221). The test cannot get past registration when actually run (RUN_LIVE_TESTS=1); everything after line 195, including the completion assertions at lines 232-233, is unreachable. Production has diverged from this test (userId is now mandatory; the newer mykobo tests pass TEST_USER_ID).

**Suggested fix:** Pass a userId to registerRamp (as mykobo-eur-*.integration.test.ts do) and stub whatever user/Avenia-account resolution the BRL onramp path requires (resolveAveniaAccountForRamp).

### `apps/api/src/api/services/phases/phase-processor.onramp.integration.test.ts:83` — stale-or-dead

testSigningAccounts uses keys 'moonbeam' and 'pendulum', cast to EphemeralAccountType at line 91. The enum values are 'Substrate' and 'EVM' (packages/shared/src/endpoints/ramp.endpoints.ts:69-72), and normalizeAndValidateSigningAccounts (ramp.service.ts:135-146) matches case-insensitively against those values and SILENTLY DROPS non-matching entries. Both accounts are discarded, so even with a valid userId, registration would fail with 'Base ephemeral not found' / missing ephemeral. The 'as EphemeralAccountType' cast hides this from the type checker. This is a second, independent reason the test is dead.

**Suggested fix:** Rename the keys to EVM/Substrate (matching EphemeralAccountType) as the mykobo integration tests do, and drop the unchecked cast.

### `apps/api/src/api/services/quote/engines/nabla-swap/base-evm.test.ts:19` — isolation-hazard

mock.module("@vortexfi/shared", ...) (and the mock.module calls at lines 33, 41, 47 for core/nabla, priceFeed.service, and config/logger) is never restored. Bun module mocks persist for the entire test process, and the factory replaces the shared package's Networks with only {Base} and EvmToken with only {BRLA, USDC}. Any test file loaded after this one sees the gutted module. This is not theoretical: `cd apps/api && bun test src/api/services/quote/` currently fails 2 tests in finalize/onramp.test.ts with 'APIError: Invalid EVM destination network' because Networks.BSC and EvmToken.USDT resolve to undefined after this file's mock is registered. The unrestored priceFeed.service mock (only getOnchainOraclePrice) similarly poisons any later file that calls priceFeedService.convertCurrency/convertCurrencyOrNull on the real singleton.

**Suggested fix:** Avoid mock.module for the whole @vortexfi/shared package: import the real shared module and use the real EvmToken/Networks/RampDirection/getOnChainTokenDetails (they are pure config), and stub only calculateNablaSwapOutputEvm and priceFeedService.getOnchainOraclePrice via property monkeypatching with afterEach restore (the pattern already used in finalize/index.test.ts and alfredpay-auth.test.ts). If mock.module must stay, capture the original exports with `import * as actual` and re-register them (mock.module(spec, () => actual)) in afterAll.

### `apps/api/src/api/services/transactions/validation.test.ts:139` — stale-or-dead

The EUR-onramp fixtures (VALID_EXAMPLE_PRESIGNED_TX_EUR_ONRAMP, lines 138-142, and VALID_EXAMPLE_UNSIGNED_TX_EUR_ONRAMP, lines 144-148) place phase "nablaApprove" on Networks.Polygon. Since the polymorphic-phase refactor (commit 1b71402a8), getTransactionTypeForPhase in validation.ts (lines 189-196) classifies nabla/distributeFees/subsidize phases as Substrate unless network === Base, so validateSubstrateTransaction rejects the fixture with "Substrate transaction signer 0xFCAd... does not match the expected signer  for phase nablaApprove" (the Substrate ephemeral is ""). Verified by running `bun test src/api/services/transactions/validation.test.ts`: 6 of 46 tests currently FAIL — "should pass validation for valid presigned EVM transactions" (line 387), "should pass validation for single valid presigned transaction" (line 393), "should throw when an ephemeral transaction is missing backup transactions" (line 448, throws but with the wrong error — the asserted backup-validation message is unreachable because tx[0] fails first), "should throw when backup transaction nonces are not sequential" (line 459, same), "accepts a subset of presigned txs when requireComplete is false" (line 1060), and "still rejects subset submissions by default" (line 1068). CI runs `cd apps/api && bun test`, so these block the suite.

**Suggested fix:** Regenerate the EUR fixture to match the current phase→signer-type mapping: put the nablaApprove tx on Networks.Base (sign with chainId 8453) with a matching unsigned counterpart, or drop nablaApprove from the fixture and anchor the backup-transaction tests on the squidRouterApprove/squidRouterSwap entries (EVM on Polygon is still valid for those phases on BUY).

### `apps/api/src/api/services/webhook/__tests__/webhook-delivery.service.test.ts:47` — cannot-fail

The global setTimeout mock returns a dummy id and never invokes the callback, so deliverWithRetry's backoff (`await new Promise(resolve => setTimeout(resolve, delay))`) never resolves. Verified by running: 7 of 10 tests time out at the per-test timeout, and the final test ('should handle network errors gracefully') hangs past bun's own timeout and wedges the entire `bun test` process (had to be SIGKILLed, exit 144). Only the two 'do nothing when no webhooks are found' tests pass. None of these tests can ever pass; they also block any full-suite run. This goes unnoticed because .github/workflows/ci.yml never runs `bun test`.

**Suggested fix:** Make the setTimeout mock invoke callbacks immediately (or leave the retry sleep unmocked and shrink retryDelays via DI), and fix the signing setup (see the crypto/HMAC finding) so delivery actually reaches fetch.

### `apps/api/src/api/services/webhook/__tests__/webhook-delivery.service.test.ts:60` — stale-or-dead

The file mocks node crypto's createHmac and gives webhooks a `secret` field, but production (commit 80bf43e5e) signs with RSA-PSS via cryptoService.signPayload (config/crypto.ts) — there is no HMAC and no per-webhook secret (webhook.model.ts has no secret column). Since cryptoService.initializeKeys() is only called in src/index.ts, signPayload throws 'RSA keys not initialized' in the test process, deliverWebhook returns false before fetch is ever called, and every assertion about fetch calls, URLs, headers and payloads is unreachable. Combined with the setTimeout mock this is why the tests hang.

**Suggested fix:** Drop the createHmac mock and webhook `secret` fixtures; either call cryptoService.initializeKeys() in setup or mock ../../../../config/crypto's signPayload to return a fixed base64 string.

### `apps/api/src/api/services/webhook/__tests__/webhook.service.test.ts:61` — stale-or-dead

The test mocks ../../../../models/rampState.model.findByPk to validate quoteId, but production webhook.service.ts:59 validates via QuoteTicket.findByPk (changed in commit b892fe2cf 'transactionId is QuoteTicket'); rampState.model is not imported by the service at all. Verified by running: 'should register a webhook with quoteId' fails (assertion at line 108 that rampStateFindByPkMock was called, which never happens) and the unmocked QuoteTicket model issues a real database query from a unit test, producing a generic 500 APIError.

**Suggested fix:** Replace the rampState.model mock with mock.module('../../../../models/quoteTicket.model', () => ({ default: { findByPk: quoteTicketFindByPkMock } })) and update the assertions accordingly.

### `apps/api/src/config/crypto.test.ts:31` — other

Always-failing test (verified: fails on `bun test src/config/crypto.test.ts`). It sets process.env.WEBHOOK_PRIVATE_KEY at test time, but CryptoService.initializeKeys() reads config.secrets.webhookPrivateKey (crypto.ts:28), and config/vars.ts snapshots process.env at module import — long before the test body runs. initializeKeys therefore derives the public key from the developer's .env key (or generates a random pair when unset), never from the test-generated private key, so the equality assertion at line 42 cannot pass on any machine.

**Suggested fix:** Inject the key instead of touching process.env: mock.module('./vars', ...) with a controlled secrets.webhookPrivateKey before importing ./crypto, or refactor initializeKeys to accept the PEM as a parameter.


## MEDIUM

### `apps/api/src/api/helpers/clientIp.test.ts:20` — isolation-hazard

The test 'adds the normalized request IP when additional data does not include one' calls enrichAdditionalDataWithClientIp with { ip: "::1" }, which normalizes to loopback 127.0.0.1. Because the test preload (apps/api/src/test-utils/preload.ts) forces DEPLOYMENT_ENV=test, the production code's non-production branch runs fetchHostPublicIp(), issuing a REAL outbound HTTPS request to the hardcoded https://api.ipify.org?format=json. Verified empirically: instrumenting globalThis.fetch during this exact call shows the request firing and the returned ipAddress being the host machine's real public IP. This violates the repo's explicit hermetic-test policy in preload.ts ('no test can accidentally reach a real external service'), makes the test environment-dependent and up to ~2s slow (abort timeout) when the endpoint is unreachable, and caches the real public IP in module-level state (cachedHostPublicIp, 10-min TTL) that bleeds into any other test importing clientIp.ts in bun's single test process.

**Suggested fix:** Avoid the loopback branch: use a non-loopback request IP, e.g. enrichAdditionalDataWithClientIp({ email: "user@example.com" }, { ip: "::ffff:203.0.113.42" }), and assert ipAddress === "203.0.113.42". If the loopback/public-IP-lookup branch itself needs coverage, stub globalThis.fetch (restoring it in afterEach) so no real network call occurs.

### `apps/api/src/api/helpers/clientIp.test.ts:23` — cannot-fail

expect(typeof additionalData?.ipAddress).toBe("string") is insensitive to the behavior the test is named after. resolvedIpAddress is set to "127.0.0.1" before the public-IP lookup and only overwritten if the lookup succeeds, so the assertion passes identically whether the ipify fetch succeeds (host's real public IP), fails ("127.0.0.1"), or normalizeClientIp is completely broken (any non-empty string). The 'normalized request IP' claimed by the test name is never actually asserted; the only regression it can catch is the ipAddress key being dropped entirely. The assertion was evidently weakened to tolerate the nondeterministic network result from the ipify call.

**Suggested fix:** After removing the network dependency (see the line 20 finding), assert the exact expected value, e.g. expect(additionalData?.ipAddress).toBe("203.0.113.42") for input ip "::ffff:203.0.113.42".

### `apps/api/src/api/middlewares/apiKeyAuth.helpers.test.ts:24` — isolation-hazard

createSecretKeyRecord builds a REAL Sequelize instance (Object.assign(new ApiKey(), {...})) with isNewRecord=true and no stubbed update(). On every successful validation path, production validateSecretApiKey calls keyRecord.update({lastUsedAt}) fire-and-forget, which issues a live INSERT INTO api_keys against the database configured in apps/api/.env (127.0.0.1:54322). Verified by running the file: Postgres responds with 'null value in column "key_prefix" of relation "api_keys" violates not-null constraint' three times, proving the query reaches the real dev DB. The tests only stay green because the INSERT happens to violate a NOT NULL constraint and production swallows the error via .catch(logger.error); if the instance ever serialized fully (schema or fixture change), the unit tests would silently persist junk API-key rows into the developer/CI database.

**Suggested fix:** Stub the persistence call on the fixture, e.g. add `update: mock(async () => keyRecord)` to the Object.assign payload (or use ApiKey.build({...}, {isNewRecord:false}) with a stubbed save), so no real DB traffic is possible.

### `apps/api/src/api/services/phases/handlers/nabla-swap-handler.test.ts:88` — isolation-hazard

QuoteTicket.findByPk is monkeypatched at module top level on the real shared Sequelize model class (`QuoteTicket.findByPk = mock(async () => ({ metadata: { nablaSwapEvm: ... } }))`) and never restored. Because bun runs all test files in one process, every later test file that touches QuoteTicket.findByPk silently receives this stub returning a nablaSwapEvm quote instead of hitting its own fixture/DB.

**Suggested fix:** Save the original (`const original = QuoteTicket.findByPk`) and restore it in afterAll, or use spyOn(QuoteTicket, "findByPk").mockImplementation(...) with mock.restore()/mockRestore() in afterAll.

### `apps/api/src/api/services/phases/handlers/squid-router-phase-handler.test.ts:119` — isolation-hazard

QuoteTicket.findByPk is monkeypatched at module top level (`QuoteTicket.findByPk = mock(async () => quote as any)`) and never restored; it also closes over the file-scoped mutable `quote` variable, so after this file runs, any later test file in the same bun process calling QuoteTicket.findByPk gets whatever quote fixture the last test here assigned.

**Suggested fix:** Restore the original findByPk in afterAll, or use spyOn with mockRestore().

### `apps/api/src/api/services/phases/handlers/squid-router-phase-handler.test.ts:200` — wrong-assertion

The Monerium onramp test builds an impossible fixture and enshrines its consequence. The quote sets `network: Networks.Polygon` (line 191) while declaring a BUY ramp with destination Base (`to: Networks.Base`, evmToEvm.toNetwork: Base). In production, quote.network for BUY is by construction the destination network (quote.controller.ts:36: `getNetworkFromDestination(rampType === BUY ? to : from)`; final-settlement-subsidy.ts:131 relies on exactly this). snapshotPreSettlementBalance intends to snapshot the ephemeral's destination-token balance (used to compute `delivered` in finalSettlementSubsidy), so for this route it must read Base USDC; the assertion `expect(getOnChainTokenDetails).toHaveBeenCalledWith(Networks.Polygon, EvmToken.USDC)` instead locks in a snapshot on the source chain. The test would keep passing if the handler read the wrong network field and would fail a correct refactor to bridgeMeta.toNetwork.

**Suggested fix:** Set the fixture's `network: Networks.Base` (consistent with a BUY ramp to Base) and assert getOnChainTokenDetails was called with (Networks.Base, EvmToken.USDC).

### `apps/api/src/api/services/phases/mykobo-eur-offramp.integration.test.ts:303` — stale-or-dead

The 'registers a Base+USDC ramp and prepares the Mykobo phase set' test can never pass at HEAD. RampService.registerRamp unconditionally throws APIError 503 'EUR ramps are currently disabled' for any quote with EURC input or output (apps/api/src/api/services/ramp/ramp.service.ts:223-228, added in commit be52569e4 'disable euro flows'). The test creates a USDC->EURC SELL quote and calls registerRamp directly, so with RUN_LIVE_TESTS=1 it always fails before any of its assertions run. Because the suite is gated behind describe.skipIf(!RUN_LIVE_TESTS), this breakage is invisible in normal CI runs.

**Suggested fix:** Either skip this test with an explicit reference to the EUR-disable guard (be52569e4) until EUR ramps are re-enabled, or make the guard bypassable for the sandbox contract test (e.g., env flag checked in registerRamp) so the test can exercise the Mykobo path again.

### `apps/api/src/api/services/phases/mykobo-eur-onramp.integration.test.ts:304` — stale-or-dead

Same defect as the offramp file: the 'registers a EUR->Base USDC onramp' test calls RampService.registerRamp with an EURC-input quote, but registerRamp unconditionally rejects EURC quotes with 'EUR ramps are currently disabled' (ramp.service.ts:223-228, commit be52569e4). With RUN_LIVE_TESTS=1 the test always throws before reaching its phase/state assertions (lines 315-348), so the entire Mykobo onramp registration contract is untested despite appearing covered.

**Suggested fix:** Skip with an explanatory comment tied to the EUR-disable guard, or add a test-only bypass for the guard so the sandbox contract test remains executable.

### `apps/api/src/api/services/phases/mykobo-eur-onramp.integration.test.ts:117` — isolation-hazard

Identical unrestored module-scope patching as the offramp file (RampState/QuoteTicket statics at 117-169, BrlaApiService.getInstance at 187, RampRecoveryWorker.prototype.start at 189, mock.module of ../quote/core/nabla at 10 and ../mykobo/mykobo-customer.service at 35), executed even when the suite is skipped. Additionally, this file mocks ../quote/core/nabla with a 1.05 rate while the offramp file mocks the same module with 0.92 — whichever file loads last silently wins for any subsequent importer of the real module in the same bun process, making cross-file behavior order-dependent. Writes lastRampStateMykoboEurOnramp.json into the src tree as a side effect.

**Suggested fix:** Same as offramp file: gate patching behind RUN_LIVE_TESTS in beforeAll and restore in afterAll; scope the nabla mock per-file lifetime.

### `apps/api/src/api/services/phases/phase-processor.onramp.integration.test.ts:205` — stale-or-dead

The test calls rampService.startRamp (line 205) BEFORE rampService.updateRamp with presignedTxs (line 224). The current startRamp requires presigned transactions to already be present and throws 'No presigned transactions found. Please call updateRamp first.' (ramp.service.ts:473-478). The call order enshrines an obsolete API contract; startRamp is also the only place that triggers phaseProcessor.processRamp, so with this ordering processing would never start even if startRamp did not throw.

**Suggested fix:** Reorder to sign transactions, call updateRamp with presignedTxs, then call startRamp.

### `apps/api/src/api/services/phases/phase-processor.recovery.integration.test.ts:9` — stale-or-dead

RAMP_STATE_RECOVERY is an empty placeholder object ('{ // ... }'), so rampState has no id, currentPhase, or flowVariant. PhaseProcessor.processRamp then early-returns at the flow-variant guard (phase-processor.ts:45-50: state.flowVariant undefined !== config.flowVariant, which always resolves to 'monerium' or 'mykobo' per config/vars.ts:46-54) after only logging a warning. As committed, the test performs no recovery processing at all — it is a dead fixture that must be hand-edited to do anything.

**Suggested fix:** Load the fixture from failedRampStateRecovery.json (the workflow CLAUDE.md documents) and fail fast with a clear error if the fixture is empty/missing, instead of silently no-opping.

### `apps/api/src/api/services/phases/phase-processor.recovery.integration.test.ts:96` — cannot-fail

The test contains zero expect() calls (expect is not even imported) and ends with an unconditional 3,000,000 ms sleep. processor.processRamp never throws for phase failures — it catches them internally and only logs (phase-processor.ts:75-77) — so recovery failure cannot surface through the try/catch either. Outcome depends solely on the runner timeout: under bun's default 5 s per-test timeout the test ALWAYS fails on timeout regardless of correctness; with the documented large --timeout it sleeps ~50 minutes and then ALWAYS passes regardless of whether the ramp recovered. The result never reflects the behavior under test.

**Suggested fix:** Replace the fixed sleep with a poll loop on rampState.currentPhase (like waitForCompleteRamp in the onramp test) and assert the final phase is 'complete' (or at least not 'failed').

### `apps/api/src/api/services/phases/phase-processor.recovery.integration.test.ts:47` — isolation-hazard

RampState.update/findByPk/create are monkeypatched at module scope (47-82) and mock.module permanently replaces ../../workers/ramp-recovery.worker (14-23); neither is restored, and both execute on every `bun test` run even though the describe is skipped without RUN_LIVE_TESTS. In bun's single-process test runner these patches persist into all later test files that use the real RampState statics or the recovery worker. The mocked update/findByPk also write failedRampStateRecovery.json into the src tree as a side effect (gitignored, but a repo-dir write).

**Suggested fix:** Gate the patching behind RUN_LIVE_TESTS inside beforeAll, capture and restore the original statics in afterAll.

### `apps/api/src/api/services/priceFeed.service.test.ts:8` — isolation-hazard

mock.module("@vortexfi/shared", ...) (line 8), mock.module("./nablaReads/outAmount") (line 94), mock.module("./pendulum/apiManager") (line 111), mock.module("../../config/logger") (line 129), and mock.module("../../../index", () => ({})) (line 147) are registered at file scope and never restored (grep confirms no mock.restore anywhere in the file). Bun runs all test files in one process, so every apps/api test file that loads after this one and imports @vortexfi/shared receives the gutted stub instead of the real package. The stub is missing most real exports (FiatToken, MykoboApiService, mapMykoboReviewStatus, Networks, etc.) and replaces getPendulumDetails/isFiatToken/getTokenUsdPrice with fakes whose semantics diverge from production (e.g. isFiatToken returns true only for BRL/EUR/ARS, while the real FiatToken set is EURC/ARS/BRL/USD/MXN/COP). 29 api test files import @vortexfi/shared, many of which sort after this file (quote/**, ramp/**, transactions/**, webhook/**), plus the app entry module is mocked to {} for everyone.

**Suggested fix:** Build the shared mock from the real module (const actual = await import("@vortexfi/shared"); mock.module("@vortexfi/shared", () => ({ ...actual, getTokenOutAmount: ..., getTokenUsdPrice: ... }))) so untouched exports stay real, and restore the overridden exports in afterAll (or run this file with test isolation / a preload). Drop the logger and ../../../index module mocks or restore them the same way.

### `apps/api/src/api/services/priceFeed.service.test.ts:417` — cannot-fail

"should work without API key" asserts headers do NOT contain "x-cg-demo-api-key", but production (priceFeed.service.ts line 120) sets "x-cg-pro-api-key" when a key exists. Since the code never sets "x-cg-demo-api-key" under any condition, expect.not.objectContaining({"x-cg-demo-api-key": ...}) passes whether or not an API key header is attached — the assertion is vacuous. Additionally, the test's premise is dead: delete process.env.COINGECKO_API_KEY (line 405) has no effect because the service reads config.priceProviders.coingecko.apiKey from config/vars, which captured the environment at import time.

**Suggested fix:** Assert absence of the header the code actually sets ("x-cg-pro-api-key"), and control the key via the instance (e.g. Object.assign(serviceInstance, { coingeckoApiKey: undefined })) instead of process.env, mirroring how the TTL tests override cryptoCacheTtlMs.

### `apps/api/src/api/services/priceFeed.service.test.ts:217` — isolation-hazard

beforeEach/afterEach only reset the private static PriceFeedService.instance, but many tests run against the module-level exported singleton `priceFeedService`, whose cryptoPriceCache/fiatExchangeRateCache Maps are never cleared. Tests are therefore order-dependent: "should fetch price from CoinGecko API when cache is empty" (line 250) only sees an empty cache because it happens to run first; the "populate cache" call in the next test (line 262) is actually a cache hit left over from line 250; "should convert USD to crypto" (line 559) expects exactly 1 fetch and relies on no earlier test having cached ethereum:usd on the shared singleton. Reordering tests, or another test file using priceFeedService earlier in the same bun process, breaks the call-count assertions. The populated caches (bitcoin=50000, BRL rate 1.25, real Date.now + 300000ms TTL) also persist into any later test file that uses the exported singleton.

**Suggested fix:** In beforeEach, also clear the exported singleton's caches ((priceFeedService as any).cryptoPriceCache.clear(); (priceFeedService as any).fiatExchangeRateCache.clear()), or run every test against a freshly-obtained instance instead of the module-level export.

### `apps/api/src/api/services/quote/engines/squidrouter/index.test.ts:8` — isolation-hazard

mock.module("../../core/squidrouter", ...) replaces the real core/squidrouter module with an object exposing only calculateEvmBridgeAndNetworkFee, and is never restored. getTokenDetailsForEvmDestination (used by finalize/onramp.ts and core/squidrouter consumers) disappears from the module registry for the rest of the process. Reproduced: `bun test src/api/services/quote/engines/squidrouter/index.test.ts src/api/services/quote/engines/finalize/onramp.test.ts` aborts the entire onramp test file with "SyntaxError: Export named 'getTokenDetailsForEvmDestination' not found in module .../core/squidrouter.ts". The full-directory run currently passes only because bun happens to load finalize/onramp.test.ts before this file; any new test file sorting after it that imports core/squidrouter, or a change in load order, breaks.

**Suggested fix:** Mock only the one function while preserving the module's other exports: `import * as actualSquidrouter from "../../core/squidrouter"; mock.module("../../core/squidrouter", () => ({ ...actualSquidrouter, calculateEvmBridgeAndNetworkFee: mock(async () => ...) }))`, and restore the original exports in afterAll (mock.module with the actual namespace).

### `apps/api/src/api/services/ramp/base.service.test.ts:34` — isolation-hazard

Lines 34-38 monkeypatch the sequelize singleton (sequelize.transaction, sequelize.query) and three QuoteTicket statics (update, findAll, destroy) at module scope and never restore them (no afterAll). bun test runs all files in one process, so every test file loaded after this one sees a sequelize.query that returns [{acquired: true}] for ANY query and a sequelize.transaction mock that invokes its first argument as a callback (calling it without a callback, as BaseRampService.withTransaction does, throws 'callback is not a function'). Any later file exercising real DB paths or unmocked QuoteTicket statics silently runs against these fakes.

**Suggested fix:** Capture the originals before patching and restore them in afterAll (or use spyOn with mockRestore), e.g. save sequelize.transaction/query and QuoteTicket.update/findAll/destroy at module top and reassign them in afterAll.

### `apps/api/src/api/services/ramp/ephemeral-freshness.test.ts:14` — isolation-hazard

mock.module("@vortexfi/shared", ...) is process-global in bun and is never undone. It permanently replaces ApiManager and EvmClientManager (with stubs closed over this file's mutable variables substrateNonce/substrateFree/evmNonce/evmGetClientShouldThrow) for every module loaded after this file in the same bun test process. It also collides with src/api/services/transactions/onramp/common/transactions.test.ts:41, which registers its own mock.module("@vortexfi/shared") — whichever loads last rewires the shared package for both, making results order-dependent. Later tests that need real chain clients (phase handler / integration tests importing ApiManager or EvmClientManager) silently get stubs reporting nonce 0 and zero balances.

**Suggested fix:** In afterAll, re-register the module with its actual implementations (mock.module("@vortexfi/shared", () => require("@vortexfi/shared") actual exports) or mock only the two managers via a dedicated injectable seam), and document that the stub state variables are only valid inside this file.

### `apps/api/src/api/services/ramp/ramp.service.register-auth.test.ts:70` — cannot-fail

The 'rejects registration with no effective user with 400' test asserts only that registerRamp throws an APIError with status 400 and discards the APIError returned by expectRegisterError. It cannot detect removal of the guard it locks in: if the effectiveUserId guard at ramp.service.ts:216 were deleted, registerRamp(userId=undefined, quote.userId=null) still throws APIError 400 further down (prepareAveniaOnrampTransactions at ramp.service.ts:1110 throws 400 'Parameter destinationAddress is required for onramp' because additionalData is {}) — the exact downstream failure the first test in this file documents in its comment. So the test passes with or without the user-gating guard.

**Suggested fix:** Use the returned error to pin the guard's distinctive message, e.g. const error = await expectRegisterError(undefined, httpStatus.BAD_REQUEST); expect(error.message).toContain("requires an API key linked to a user");

### `apps/api/src/api/services/transactions/onramp/common/transactions.test.ts:41` — isolation-hazard

mock.module("@vortexfi/shared", ...) (line 41), mock.module("../../../../../config/vars", ...) (line 60), and the moonbeam/pendulum cleanup mocks (lines 68, 72) are never restored — there is no afterAll, and bun's mock.restore() does not undo mock.module. bun test executes all files in one process, and I reproduced concrete leakage: adding a test file to the same run that statically imports @vortexfi/shared after this file received the stub module and crashed at load with "SyntaxError: Export named 'NUMBER_OF_PRESIGNED_TXS' not found in module '.../packages/shared/dist/node/index.js'" (the mock factory only exports the handful of names this test needs). The existing suite is currently unaffected only by luck of bun's file-walk order (validation.test.ts happens to run before the onramp directories); any new test file ordered after this one that imports @vortexfi/shared or config/vars can be poisoned.

**Suggested fix:** Snapshot the real modules before mocking (const realShared = await import("@vortexfi/shared")) and restore them in afterAll via mock.module("@vortexfi/shared", () => realShared) — same for config/vars and the two cleanup modules. Alternatively, spread the real module into the factory ({ ...realShared, createNablaTransactionsForOnrampOnEVM }) so un-mocked exports stay intact.

### `apps/api/src/api/services/transactions/onramp/routes/avenia-to-evm-base.test.ts:46` — isolation-hazard

Ten mock.module calls with no restoration: @vortexfi/shared (line 46) replaced by a stub missing most real exports (no NUMBER_OF_PRESIGNED_TXS, RampDirection, WebhookEventType, CleanupPhase, etc.), the transactions barrel "../../index" reduced to a single export encodeEvmTransactionData (line 175), and config/logger reduced to { debug } only (line 183) — any later-loaded code calling logger.info/error would crash. Combined with the sibling file's mocks, whichever @vortexfi/shared factory registers last wins for the rest of the process; bun runs all test files in one process and mock.module leakage into later files was reproduced in this run configuration (see transactions.test.ts finding). Nothing in the current suite breaks today only because of bun's file ordering, which is an accident, not a guarantee.

**Suggested fix:** Capture the real modules with await import(...) before mock.module and restore them in afterAll; for @vortexfi/shared and ../../index, build the factory as { ...realModule, <overrides> } so the mock does not silently delete unrelated exports.

### `apps/api/src/api/services/webhook/__tests__/webhook-delivery.service.test.ts:414` — wrong-assertion

Asserts the X-Vortex-Signature header matches /^sha256=/. Production sets the header to the raw base64 RSA-PSS signature from cryptoService.signPayload (webhook-delivery.service.ts:13-15,37) with no 'sha256=' prefix — that prefix belongs to the removed HMAC scheme. Even after the hang is fixed, this assertion enshrines the wrong signature format.

**Suggested fix:** Assert the header equals the (mocked or real) base64 signature, e.g. expect.any(String) plus a verifySignature round-trip, not a sha256= prefix.

### `apps/api/src/api/services/webhook/__tests__/webhook-delivery.service.test.ts:157` — wrong-assertion

The expected payload omits `quoteId` and asserts transactionId: 'tx-123'. Production's triggerTransactionCreated(quoteId, sessionId, transactionId, type) is called as ('tx-123', 'session-456', 'tx-id', BUY) and builds payload.payload = { quoteId: 'tx-123', sessionId: 'session-456', transactionId: 'tx-id', ... } (webhook-delivery.service.ts:95-105, commits eb9e79adc/755218975). The strict toEqual can never match. Same defect at line 257: expects payload.payload.transactionId to be 'tx-123' where production sends 'tx-id' ('tx-123' is the quoteId).

**Suggested fix:** Expect { quoteId: 'tx-123', sessionId: 'session-456', transactionId: 'tx-id', transactionStatus: 'PENDING', transactionType: 'BUY' }; at line 257 assert transactionId 'tx-id' and quoteId 'tx-123'.

### `apps/api/src/api/services/webhook/__tests__/webhook.service.test.ts:247` — cannot-fail

'should reject when quoteId does not exist' sets rampStateFindByPkMock.mockResolvedValue(null), which is inert (service uses QuoteTicket, not RampState). The test passes only because the unmocked QuoteTicket.findByPk errors against the DB and registerWebhook wraps every error in an APIError; the only assertion is rejects.toBeInstanceOf(APIError), which every failure path satisfies. Deleting the 404 not-found validation from webhook.service.ts would not fail this test.

**Suggested fix:** After fixing the model mock, mockResolvedValue(null) on QuoteTicket.findByPk and assert the APIError has status 404 / message containing 'not found'.

### `apps/api/src/api/services/webhook/__tests__/webhook.service.test.ts:196` — cannot-fail

'should handle registration errors' mocks Webhook.create to reject, but the flow never reaches Webhook.create: the request includes quoteId 'quote-123', so the unmocked QuoteTicket.findByPk throws first and already yields the generic APIError. The create-failure path this test claims to cover is never executed, and the assertion (rejects.toBeInstanceOf(APIError)) passes for the wrong reason.

**Suggested fix:** Mock QuoteTicket.findByPk to resolve an existing quote so the rejection genuinely comes from Webhook.create, and assert status 500.

### `apps/api/src/config/crypto.test.ts:76` — cannot-fail

'should generate new key pair when WEBHOOK_PRIVATE_KEY is not provided' deletes process.env vars, which is inert for the same config-snapshot reason. On this machine (and any with WEBHOOK_PRIVATE_KEY in apps/api/.env, which bun auto-loads) the test actually executes the load-from-environment branch — the run log prints 'RSA keys loaded from environment (public key derived from private)' during this test — yet it still passes because its assertions (truthy PEM, sign/verify round-trip) hold for either branch. The generateKeyPair path it claims to cover can be arbitrarily broken without this test noticing.

**Suggested fix:** Mock ./vars so config.secrets.webhookPrivateKey is undefined for this test, and assert the generation branch ran (e.g. the resulting public key differs from the env-derived one).

### `apps/api/src/config/vars.test.ts:6` — isolation-hazard

requiredProductionEnv omits FLOW_VARIANT, which vars.ts:267 requires when NODE_ENV=production. The suite still passes locally only because Bun.spawn (line 16) runs the child with cwd=apps/api, where bun auto-loads the developer's .env (it contains FLOW_VARIANT), silently un-hermetizing the carefully constructed env. Reproduced: running the exact test-1 scenario from a directory without .env exits 1 with 'Missing required environment variables in production: FLOW_VARIANT', so the 'allows sandbox mode...' test (line 41) fails on a clean checkout/CI. Any other unset variable can likewise leak from .env into these subprocess tests.

**Suggested fix:** Add FLOW_VARIANT to requiredProductionEnv and pass a cwd without .env files (e.g. os.tmpdir()) in Bun.spawn so the local .env cannot mask missing variables.

### `apps/rebalancer/src/utils/config.test.ts:46` — isolation-hazard

The test 'uses the default when the env value is missing' calls parseRebalancingDailyBridgeLimitUsd(undefined). Passing undefined triggers the default parameter (value = process.env.REBALANCING_DAILY_BRIDGE_LIMIT_USD in config.ts:21), so the test actually reads the ambient environment instead of simulating a missing value. REBALANCING_DAILY_BRIDGE_LIMIT_USD is the one policy variable omitted from the file's policyEnvVars cleanup list (lines 9-21), so the beforeEach scrub never deletes it. The variable is documented uncommented in apps/rebalancer/.env.example, and Bun auto-loads .env when running tests from apps/rebalancer. Verified empirically: 'REBALANCING_DAILY_BRIDGE_LIMIT_USD=50000 bun test src/utils/config.test.ts' fails this test (expected 10000, received 50000). It only passes today because the developer's .env happens not to set the variable (and .env.example's value coincidentally equals the 10_000 default). The same gap can make the getConfig tests (lines 137-150) throw spuriously if the ambient value is malformed, since getConfig() calls parseRebalancingDailyBridgeLimitUsd() internally (config.ts:107).

**Suggested fix:** Add "REBALANCING_DAILY_BRIDGE_LIMIT_USD" to the policyEnvVars array (apps/rebalancer/src/utils/config.test.ts:9-21) so the existing beforeEach delete / afterEach restore covers it; the call at line 46 then genuinely exercises the missing-env default.

### `packages/shared/src/services/xcm/assethubToMoonbeam.test.ts:25` — cannot-fail

The test has zero assertions: it builds the extrinsic, dry-runs it, and only console.logs the result. dryRunApi.dryRunCall returns a Result whose payload contains the execution outcome (success or an XCM error such as Filtered/FailedToTransactAsset); the test never inspects it, so a dry run that reports failure still passes. Even when opted in via RUN_LIVE_TESTS, the test can only fail on a thrown exception (e.g., RPC unreachable), never on the behavior it claims to verify.

**Suggested fix:** Assert on the dry-run outcome, e.g. unwrap the Result and expect(result.isOk).toBe(true) plus expect the inner executionResult to be Complete/Ok; remove the console.log-only pattern.


## LOW

### `apps/api/src/api/middlewares/dualAuth.test.ts:5` — stale-or-dead

The file is named dualAuth.test.ts but contains zero tests of dualAuth.ts: it imports and tests only assertQuoteOwnership/assertRampOwnership from ./ownershipAuth (line 5). The dual-track auth handler itself (dualAuthHandler / requirePartnerOrUserAuth / optionalPartnerOrUserAuth in dualAuth.ts) is untested by this file; dualAuth.ts merely re-exports the ownership helpers. The name reflects a pre-extraction layout and misleads maintainers into thinking the dual-auth middleware has coverage here.

**Suggested fix:** Rename the file to ownershipAuth.test.ts (no content change needed).

### `apps/api/src/api/services/phases/helpers/brla-onramp-hold.test.ts:71` — cannot-fail

In "does not update state when the Avenia pay-in ticket is missing", `expect(state.state.onHold).toBe(false)` asserts the fixture's own initial value (makeState(false)) and cannot fail: with an empty ticket list there is no code path that could set onHold to true, and if syncAveniaOnHoldState erroneously invoked updateState({...state, onHold: false}) despite the missing ticket, the assertion would still pass. The test's stated claim (state is not updated) is never actually verified; only the ticketFound === false assertion on line 70 is meaningful.

**Suggested fix:** Pass a mock as the updateState callback and assert it was not called, e.g. `const updateState = mock(async () => {}); ...; expect(updateState).not.toHaveBeenCalled();`.

### `apps/api/src/api/services/phases/phase-processor.onramp.integration.test.ts:158` — stale-or-dead

mock.module("../brla/helpers", ...) targets apps/api/src/api/services/brla/helpers, but that directory no longer exists — verifyReferenceLabel now lives in packages/shared/src/services/brla/helpers.ts and is not called anywhere in apps/api production code. The mock (and mockVerifyReferenceLabel at line 153) is vestigial: it registers a virtual module nobody imports, so the intended bypass of reference-label verification silently does nothing.

**Suggested fix:** Delete the mock, or if reference-label verification is still exercised by the live flow, re-point the mock at the module that production actually imports (@vortexfi/shared).

### `apps/api/src/api/services/priceFeed.service.test.ts:94` — stale-or-dead

mock.module("./nablaReads/outAmount", ...) (line 94) and mock.module("./pendulum/apiManager", ...) (line 111) target modules that do not exist in apps/api: there is no src/api/services/nablaReads directory, and src/api/services/pendulum contains only helpers.ts and pendulum.service.ts. priceFeed.service.ts imports getTokenOutAmount and ApiManager from @vortexfi/shared, so these mocks are dead leftovers from an older import layout and shadow nothing the service uses; the comment on line 93 ("Keep the existing mock structure for Nabla") confirms the drift.

**Suggested fix:** Delete both mock.module blocks; the @vortexfi/shared mock already provides getTokenOutAmount and ApiManager.

### `apps/api/src/api/services/priceFeed.service.test.ts:596` — cannot-fail

"should use default values when environment variables are not set" deletes COINGECKO_API_URL/CRYPTO_CACHE_TTL_MS/FIAT_CACHE_TTL_MS (lines 598-600) before creating a new instance, but the constructor reads config/vars values captured at process start, so the env deletion is a no-op and the default-fallback behavior the title claims to test is never exercised. The test ends up asserting exactly the same three config-snapshot values as the next test (line 619, which honestly documents this "keep loaded configuration" behavior) — it is a duplicate whose setup cannot influence the outcome. The same applies to the env vars set in the outer beforeEach (lines 176-182): they never reach the service.

**Suggested fix:** Delete this test (line 619's test already covers the config-snapshot behavior), or if default-fallback coverage is wanted, test config/vars parsing directly where the defaults are applied.

### `apps/api/src/api/services/quote/engines/discount/helpers.test.ts:33` — other

The describe block "negative targetDiscount scenarios (rate floor)" does not test negative-target-discount behavior. calculateSubsidyAmount(expectedOutput, actualOutput, maxSubsidy) has no discount parameter; the negative-discount / rate-floor logic lives in calculateExpectedOutput (helpers.ts lines 74-92), which this file never calls. The four tests in the block are structurally identical to the earlier cases (shortfall subtraction and maxSubsidy cap) with different constants, so the block name gives false confidence that the rate-floor path is covered while enshrining nothing about it.

**Suggested fix:** Either rename the block to reflect what it tests (plain shortfall/cap arithmetic) and drop the duplicated cases, or actually test calculateExpectedOutput with a negative targetDiscount and assert the discounted rate/expected output it produces.

### `apps/api/src/api/services/transactions/validation.test.ts:246` — cannot-fail

In "matches a signed EVM transaction to the unsigned server-built transaction", signedTx is constructed as { ...unsignedTx, txData: signedRawTx }, and areAllTxsIncluded (validation.ts:169-185) compares only phase/network/nonce/signer — fields that are identical by construction via the spread. The ~30 lines of EIP-1559 signing setup cannot influence the assertion; expect(areAllTxsIncluded([signedTx], [unsignedTx])).toBe(true) only fails if areAllTxsIncluded itself is totally broken, and the signed-vs-unsigned matching the test name promises is never exercised (the stray comment on line 245, "change to use universal validator", acknowledges this).

**Suggested fix:** Either delete the signing ceremony and rename the test to state it checks metadata-only matching (the neighboring test at line 249 already documents that txData is ignored), or convert it to call validatePresignedTxs so the signature/nonce/value verification is actually on the assertion path.

### `apps/api/src/api/services/webhook/__tests__/webhook.service.test.ts:45` — stale-or-dead

mock.module('crypto') with randomBytes exists to support webhook secret generation, which was removed from production in commit f1ff2092d ('remove secret generation in the webhook registration'); webhook.service.ts no longer imports crypto and the model has no secret column. The mock and its beforeEach reset/re-arm (lines 87-90) are dead setup.

**Suggested fix:** Delete the crypto mock and randomBytesMock plumbing.

### `apps/api/src/config/crypto.test.ts:60` — cannot-fail

'should be able to sign and verify with derived public key' has the same inert env manipulation: the keypair actually used comes from config at import time, not the test-generated private key, so the 'derived public key' premise is not what is exercised. The test still passes because any consistent keypair satisfies the sign/verify round-trip — it verifies signPayload/verifySignature generally, not derivation.

**Suggested fix:** Either rename/re-scope the test to 'sign/verify round-trip' or inject the test key via a mocked ./vars so it genuinely uses the derived key.

### `apps/frontend/src/pages/progress/phaseFlows.test.ts:6` — cannot-fail

Both tests (lines 6-16 and 20-35) assert that the PHASE_FLOWS constant equals a verbatim copy of itself pasted from phaseFlows.ts. There is no independent oracle: the test names claim to match 'the active BRL ... runtime phases' (i.e. backend parity), but nothing ties the expected arrays to the backend phase handlers in apps/api/src/api/services/phases/handlers/. The test can only fail when someone edits the frontend constant, at which point the test is updated to match — it can never detect the drift-from-backend bug it purports to guard. (I verified the current arrays do happen to match the backend transition chains, so no wrong assertion — the defect is that the test provides zero verification while implying runtime parity.)

**Suggested fix:** Either delete the file, or make the expectation independent: derive/export the canonical phase sequences from a shared source used by both backend and frontend, or at minimum rename the tests to state they only pin the frontend constant against accidental edits.

### `apps/frontend/src/translations/helpers.test.ts:170` — cannot-fail

'demonstrates how easy it would be to add Spanish support' builds a local object `extendedFamilies` (lines 165-168) and then asserts properties the test itself just set (lines 170-171: length 3 and es === 'es'). Those assertions cannot fail regardless of production behavior. The only production-touching assertion is the brittle Object.keys length check on line 163, which asserts a count, not behavior.

**Suggested fix:** Delete this test (it documents nothing enforceable), or keep only meaningful assertions on the exported LANGUAGE_FAMILIES map.

### `apps/frontend/src/translations/helpers.test.ts:187` — cannot-fail

'demonstrates the simplicity of the language code extraction' re-implements the extraction expression inline (line 186: input.toLowerCase().split('-')[0]) and asserts against that inline copy. It never calls any exported function from helpers.ts, so if the production extraction logic in getBrowserLanguage changed or broke, this test would still pass — it only tests JavaScript string methods.

**Suggested fix:** Delete the test; the real extraction path is already covered via getBrowserLanguage in 'should extract language code correctly from complex locale strings' (lines 108-114).

### `packages/shared/src/services/xcm/assethubToMoonbeam.test.ts:17` — other

The test passes assetAccountKey = '0xFFfffffF7D2B0B761Af01Ca8e25242976ac0aD7D' commented as 'xcUSDC', implying the transfer moves that asset. The production function createAssethubToMoonbeamTransferWithSwapOnHydration accepts assetAccountKey but never uses it — the XCM message hardcodes USDT on AssetHub (PalletInstance 50 / GeneralIndex 1984). The argument is inert, so the test misleadingly enshrines a dead parameter and would keep passing no matter what asset key is supplied.

**Suggested fix:** Either wire assetAccountKey through in the production function so it actually selects the asset, or drop the parameter from the signature and the test call to stop implying it has an effect.

### `packages/shared/src/services/xcm/moonbeamToAssethub.test.ts:25` — cannot-fail

Same defect as the assethubToMoonbeam test: no assertions at all. The dry-run Result is only logged via console.log, so a failed XCM dry run (which is the expected outcome here, see the stale-feature finding) still makes the test pass. The test can only fail on network/API exceptions, never on the dry-run outcome it exists to check.

**Suggested fix:** Assert on the dry-run Result (isOk and inner execution result) instead of logging it, or delete the test together with the dead production function.

### `packages/shared/src/services/xcm/moonbeamToAssethub.test.ts:15` — stale-or-dead

The test exercises createMoonbeamToAssethubTransferWithSwapOnHydration, whose own doc comment in packages/shared/src/services/xcm/moonbeamToAssethub.ts (line 51) states: 'WARNING: The resulting XCM transaction does not work because Moonbeam does not allow polkadotXcm::execute calls'. The dry run of this extrinsic can therefore only ever report failure (Filtered), meaning the test targets a documented-dead feature and validates nothing even in live mode.

**Suggested fix:** Delete this test (and consider removing the dead production function), or convert it into a test that asserts the dry run reports the expected Filtered error if documenting the limitation is intended.
