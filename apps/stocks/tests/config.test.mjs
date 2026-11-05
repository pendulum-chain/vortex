import assert from "node:assert/strict";
import test from "node:test";
import { ALLOWED_ENV, STOCKS_MODES, config, publicKeyError, readConfig } from "../src/lib/config.js";

const APP_ID = "cmtiwhqgf01uu0el8lx3ejr35";

test("an unset mode is the safe demo: fake login, simulated ramp, ramp off", () => {
  const cfg = readConfig({});
  assert.equal(cfg.mode, "demo");
  assert.equal(cfg.usesPrivy, false);
  assert.equal(cfg.rampKind, "simulated");
  assert.equal(cfg.rampEnabled, false);
  assert.equal(cfg.prices, "demo");
  assert.equal(readConfig({ VITE_STOCKS_MODE: "  " }).mode, "demo");
  assert.ok(Object.isFrozen(cfg));
  // Under node there is no import.meta.env, so the module-level config is the demo too.
  assert.equal(config.mode, "demo");
});

test("preview uses the real login but never the Vortex ramp, even with the flag", () => {
  const cfg = readConfig({ VITE_STOCKS_MODE: "preview", VITE_PRIVY_APP_ID: APP_ID, VITE_STOCKS_RAMP_ENABLED: "true" });
  assert.equal(cfg.usesPrivy, true);
  assert.equal(cfg.rampKind, "simulated");
  assert.equal(cfg.rampEnabled, false);
  assert.equal(cfg.prices, "live");
});

test("live keeps the Vortex ramp off unless the flag is exactly \"true\"", () => {
  const live = (flag) => readConfig({ VITE_STOCKS_MODE: "live", VITE_PRIVY_APP_ID: APP_ID, ...(flag === undefined ? {} : { VITE_STOCKS_RAMP_ENABLED: flag }) });
  assert.equal(live().rampKind, "vortex");
  assert.equal(live().rampEnabled, false);
  assert.equal(live("").rampEnabled, false);
  assert.equal(live("true").rampEnabled, true);
  for (const flag of ["TRUE", "1", "yes", " true"]) assert.equal(live(flag).rampEnabled, false, flag);
});

test("a non-empty invalid mode or a missing Privy id is a visible config error", () => {
  assert.deepEqual(readConfig({ VITE_STOCKS_MODE: "production" }), { error: "VITE_STOCKS_MODE inválido: \"production\"" });
  assert.deepEqual(readConfig({ VITE_STOCKS_MODE: "Live", VITE_PRIVY_APP_ID: APP_ID }), { error: "VITE_STOCKS_MODE inválido: \"Live\"" });
  assert.deepEqual(readConfig({ VITE_STOCKS_MODE: "live" }), { error: "VITE_PRIVY_APP_ID não configurado." });
  assert.deepEqual(readConfig({ VITE_STOCKS_MODE: "preview" }), { error: "VITE_PRIVY_APP_ID não configurado." });
  assert.equal(readConfig({ VITE_STOCKS_MODE: "demo" }).error, undefined);
  assert.match(readConfig({ VITE_STOCKS_NETWORK: "Robinhood Chain" }).error, /VITE_STOCKS_NETWORK/);
  assert.match(readConfig({ VITE_ROBINHOOD_RPC_URL: "http://rpc.example" }).error, /https/);
});

test("the API base defaults to the same-origin /api/production proxy", () => {
  assert.equal(readConfig({}, "https://www.vortexfinance.co").apiBase, "https://www.vortexfinance.co/api/production");
  assert.equal(readConfig({ VITE_SIGNING_SERVICE_PATH: "/api/staging" }, "https://deploy-preview-1--vortex.netlify.app").apiBase, "https://deploy-preview-1--vortex.netlify.app/api/staging");
});

test("network and RPC override default to the assumed Vortex contract; the token id is not configurable", () => {
  const cfg = readConfig({});
  assert.equal(cfg.network, "robinhood");
  assert.equal(cfg.robinhoodRpcUrl, "");
  // Tokens are always identified by address: a symbol id would unpin quotes from the allowlist.
  assert.ok(!("tokenIdMode" in readConfig({ VITE_STOCKS_TOKEN_ID_MODE: "symbol" })));
  assert.ok(!ALLOWED_ENV.includes("VITE_STOCKS_TOKEN_ID_MODE"));
  assert.equal(readConfig({ VITE_ROBINHOOD_RPC_URL: "https://rpc.example/v2/restricted" }).robinhoodRpcUrl, "https://rpc.example/v2/restricted");
});

test("the mode list and the env allowlist are closed", () => {
  assert.deepEqual([...STOCKS_MODES], ["demo", "preview", "live"]);
  assert.ok(Object.isFrozen(ALLOWED_ENV));
  assert.ok(!ALLOWED_ENV.includes("VITE_DEMO_MODE"));
  assert.equal(new Set(ALLOWED_ENV).size, ALLOWED_ENV.length);
});

test("only a public pk_ key is accepted: a secret sk_ key is a config error and fails the build", async () => {
  const live = (key) => readConfig({ VITE_STOCKS_MODE: "live", VITE_PRIVY_APP_ID: APP_ID, VITE_VORTEX_PUBLIC_KEY: key });
  const PK = `pk_test_${"fake0".repeat(6)}00`; // obviously fake, in the API's format
  assert.equal(live("").publicKey, "");
  assert.equal(live(` ${PK} `).publicKey, PK);
  assert.match(live("pk_live_short").error, /pk_/);
  assert.match(live("sk_live_fake-test-only").error, /chave secreta/);
  assert.match(live("SK_live_fake-test-only").error, /chave secreta/);
  assert.match(live("fake-test-only").error, /pk_/);
  assert.equal(publicKeyError(undefined), null);
  // The build reads the same rule before Vite inlines the value.
  const original = process.env.VITE_VORTEX_PUBLIC_KEY;
  process.env.VITE_VORTEX_PUBLIC_KEY = "sk_live_fake-test-only";
  try {
    const { default: viteConfig } = await import("../vite.config.mjs");
    assert.throws(() => viteConfig({ mode: "production", command: "build" }), /chave secreta/);
    process.env.VITE_VORTEX_PUBLIC_KEY = PK;
    assert.equal(viteConfig({ mode: "production", command: "build" }).base, "/pt-br/stocks/");
  } finally {
    if (original === undefined) delete process.env.VITE_VORTEX_PUBLIC_KEY; else process.env.VITE_VORTEX_PUBLIC_KEY = original;
  }
});
