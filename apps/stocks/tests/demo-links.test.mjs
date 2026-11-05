import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_TOOLS } from "../src/lib/config.js";
import { DEMO_FLOWS, parseDemoFlow, planDemoFlow, withoutDemoFlow } from "../src/lib/demo-links.js";
import { sourceFiles } from "./helpers.mjs";

test("demo deep links: ?demoFlow= is read from the hash query and removed after use", () => {
  assert.equal(parseDemoFlow("#/acao/NVDA?demoFlow=buy-quote"), "buy-quote");
  assert.equal(parseDemoFlow("#/?demoFlow=login"), "login");
  assert.equal(parseDemoFlow("#/explorar?q=nubank&demoFlow=learn"), "learn");
  assert.equal(parseDemoFlow("#/acao/NVDA?demoFlow=pay-everyone"), null, "unknown values do nothing");
  assert.equal(parseDemoFlow("#/acao/NVDA"), null);
  assert.equal(parseDemoFlow(""), null);
  assert.equal(withoutDemoFlow("#/acao/NVDA?demoFlow=buy"), "#/acao/NVDA");
  assert.equal(withoutDemoFlow("#/explorar?q=nubank&demoFlow=learn"), "#/explorar?q=nubank");
  assert.equal(withoutDemoFlow("#?demoFlow=login"), "#/");
});

test("demo deep links: each flow opens its screen, signing the demo user in when needed", () => {
  assert.deepEqual(planDemoFlow("login", { signedIn: false }), { signIn: false, route: null, modal: { type: "login" } });
  assert.equal(planDemoFlow("login", { signedIn: true }), null);
  assert.deepEqual(planDemoFlow("learn", { signedIn: true }).modal, { type: "learn" });
  assert.equal(planDemoFlow("welcome", { signedIn: false }).signIn, true);
  assert.deepEqual(planDemoFlow("buy-quote", { signedIn: false, symbol: "AAPL" }), { signIn: true, route: "#/acao/AAPL", modal: { type: "buy", symbol: "AAPL", demoQuote: true } });
  assert.equal(planDemoFlow("buy", { signedIn: true, symbol: null }).modal.symbol, "NVDA");
  assert.equal(planDemoFlow("sell", { signedIn: true, symbol: "SPY" }).needsHoldings, true);
  assert.deepEqual(planDemoFlow("sell", { signedIn: true, symbol: "SPY" }).modal, { type: "sell", symbol: "SPY" });
  assert.deepEqual(planDemoFlow("sell-reserve-used", { signedIn: false, symbol: null }), { signIn: true, route: "#/acao/NVDA", modal: { type: "sell", symbol: "NVDA", demoReserveUsed: true }, needsHoldings: true });
  assert.equal(parseDemoFlow("#/acao/NVDA?demoFlow=sell-reserve-used"), "sell-reserve-used");
  for (const flow of DEMO_FLOWS) assert.ok(planDemoFlow(flow, { signedIn: false }), flow);
});

test("demo deep links are demo-only: behind DEMO_TOOLS and only ever imported dynamically", () => {
  assert.equal(DEMO_TOOLS, true, "Node has no env, like a default (demo) build");
  const config = sourceFiles().find((file) => file.path === "src/lib/config.js").text;
  // Vite folds this exact expression to false in preview/live builds and drops the gated chunk.
  assert.match(config, /export const DEMO_TOOLS = import\.meta\.env\?\.VITE_STOCKS_MODE !== "preview" && import\.meta\.env\?\.VITE_STOCKS_MODE !== "live";/);
  for (const file of sourceFiles()) {
    assert.doesNotMatch(file.text, /(?:^|\n)\s*import\s[^;]*from\s*["'][^"']*demo-links\.js["']/, `${file.path} imports demo-links statically`);
    if (/import\(\s*["'][^"']*demo-links\.js["']\s*\)/.test(file.text)) assert.match(file.text, /if \(!DEMO_TOOLS \|\| config\.mode !== "demo"\) return/, `${file.path} must gate the deep links`);
  }
  // The flows' deep-link effects (code and KYC done, demo reserve spent) sit behind DEMO_TOOLS too.
  const sell = sourceFiles().find((file) => file.path === "src/flows/SellFlow.jsx").text;
  assert.match(sell, /if \(!DEMO_TOOLS \|\| !demoReserveUsed \|\| resume \|\| !verification\.markVerified\) return;\s*verification\.markVerified\(\);\s*runtime\.spendDemoReserve\(\);/);
  const runtime = sourceFiles().find((file) => file.path === "src/runtime.js").text;
  assert.match(runtime, /function spendDemoReserve\(\) \{\s*demoHoldings\?\.setEthWei\(DEMO_RESERVE_DUST_WEI\);/, "a no-op without demo holdings (preview, live)");
});
