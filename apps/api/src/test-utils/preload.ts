/**
 * Test environment safety net, loaded before every test file via bunfig.toml.
 *
 * Hermetic by default: points the database at the dedicated test instance and
 * replaces any real integration credentials (which bun auto-loads from .env)
 * with sentinel values so no test can accidentally reach a real external
 * service. Live tests opt out with RUN_LIVE_TESTS=1 and keep the real env.
 */
if (!process.env.RUN_LIVE_TESTS) {
  process.env.NODE_ENV = "test";
  process.env.DEPLOYMENT_ENV = "test";
  process.env.FLOW_VARIANT = process.env.FLOW_VARIANT || "mykobo";

  // Dedicated test database (started via `bun test:db:start`), never the dev database.
  process.env.DB_HOST = process.env.TEST_DB_HOST || "localhost";
  process.env.DB_PORT = process.env.TEST_DB_PORT || "54329";
  process.env.DB_NAME = process.env.TEST_DB_NAME || "vortex_test";
  process.env.DB_USERNAME = process.env.TEST_DB_USERNAME || "postgres";
  process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || "postgres";

  // Neutralize integration credentials/endpoints. The .invalid TLD is reserved
  // (RFC 2606), so any un-faked call fails fast instead of hitting production.
  process.env.MYKOBO_BASE_URL = "http://mykobo.invalid";
  process.env.MYKOBO_ACCESS_KEY = "test-mykobo-access-key";
  process.env.MYKOBO_SECRET_KEY = "test-mykobo-secret-key";
  process.env.BRLA_BASE_URL = "http://brla.invalid";
  process.env.BRLA_API_KEY = "test-brla-api-key";
  process.env.BRLA_PRIVATE_KEY = "";
  process.env.ALFREDPAY_BASE_URL = "http://alfredpay.invalid";
  process.env.ALFREDPAY_API_KEY = "test-alfredpay-api-key";
  process.env.ALFREDPAY_API_SECRET = "test-alfredpay-api-secret";
  // COINGECKO_API_URL is deliberately NOT overridden: priceFeed config tests
  // assert its default, and the fetch guard blocks real calls anyway.
  process.env.ALCHEMY_API_KEY = "";
  process.env.SUPABASE_URL = "http://supabase.invalid";
  process.env.SUPABASE_ANON_KEY = "test-anon-key";
  process.env.SUPABASE_SERVICE_KEY = "test-service-key";
  process.env.ADMIN_SECRET = "test-admin-secret";
  process.env.METRICS_DASHBOARD_SECRET = "test-metrics-secret";
  // Empty → cryptoService generates a throwaway RSA pair; a real operator key
  // in a local .env must never sign test webhook deliveries.
  process.env.WEBHOOK_PRIVATE_KEY = "";

  // Dummy signing keys (well-known dev keys, no real funds) so code that
  // derives accounts works without ever using the operator's real seeds.
  process.env.MOONBEAM_EXECUTOR_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  process.env.EVM_FUNDING_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  process.env.PENDULUM_FUNDING_SEED = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";
  process.env.FUNDING_SECRET = "";

  // Keep rate limiting out of the way of HTTP-level tests.
  process.env.RATE_LIMIT_MAX_REQUESTS = "100000";

  // Fast retries so recoverable-error scenarios don't wait 30s per attempt.
  process.env.PHASE_PROCESSOR_RETRY_DELAY_MS = "25";
  // The fake EVM ledger settles instantly; skip the 15s settlement waits and
  // the 20s backoffs between scripted transaction failures.
  process.env.SUBSIDY_SETTLEMENT_DELAY_MS = "25";
  process.env.PHASE_SETTLEMENT_RETRY_BACKOFF_MS = "25";

  // Close the shared Sequelize pool after the whole run so lingering pg
  // connections don't surface as unhandled "Connection terminated" errors.
  const { afterAll } = await import("bun:test");
  afterAll(async () => {
    const { default: sequelize } = await import("../config/database");
    await sequelize.close().catch(() => undefined);
  });
}

export {};
