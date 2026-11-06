import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ALLOWED_ENV } from "../src/lib/config.js";
import { APP, sourceFiles } from "./helpers.mjs";

const read = (path) => readFileSync(join(APP, path), "utf8");
const envExample = () => Object.fromEntries(read(".env.example").split("\n").filter((line) => /^[A-Z0-9_]+=/.test(line)).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));

test(".env.example ships the safe demo with the ramp off", () => {
  const env = envExample();
  assert.equal(env.VITE_STOCKS_MODE, "demo");
  assert.equal(env.VITE_STOCKS_RAMP_ENABLED, "");
  assert.equal(env.VITE_SIGNING_SERVICE_PATH, "/api/production");
  // The same public app id as Gold: one Privy user and wallet across the consumer apps.
  assert.equal(env.VITE_PRIVY_APP_ID, "cmtiwhqgf01uu0el8lx3ejr35");
});

test("no secret can be configured through a VITE_* variable", () => {
  const env = envExample();
  for (const [name, value] of Object.entries(env)) {
    assert.match(name, /^VITE_/, `${name} is not exposed to the browser build`);
    assert.doesNotMatch(name, /SECRET|PRIVATE|MNEMONIC|PASSWORD|SK_/i);
    assert.doesNotMatch(value, /sk_|-----BEGIN|\b(0x)?[0-9a-fA-F]{64}\b|alchemy\.com\/v2\/[A-Za-z0-9_-]+/);
  }
  for (const name of ALLOWED_ENV) assert.doesNotMatch(name, /SECRET|PRIVATE|MNEMONIC|PASSWORD|SK_/i);
});

test("every VITE_* name in .env.example and src/ is on the config allowlist", () => {
  const names = new Set(Object.keys(envExample()));
  for (const file of sourceFiles()) for (const [name] of file.text.matchAll(/\bVITE_[A-Z0-9_]+/g)) names.add(name);
  for (const name of names) assert.ok(ALLOWED_ENV.includes(name), `${name} is not in ALLOWED_ENV`);
  for (const name of ALLOWED_ENV) assert.ok(name in envExample(), `${name} is missing from .env.example`);
});

test("Stocks never reads Gold's VITE_DEMO_MODE (production sets it to false for Gold)", () => {
  const files = [...sourceFiles(), ...["index.html", "vite.config.mjs", ".env.example"].map((path) => ({ path, text: read(path) }))];
  for (const file of files) assert.ok(!file.text.includes("VITE_DEMO_MODE"), `${file.path} mentions VITE_DEMO_MODE`);
});

test("only src/lib/config.js reads VITE_* variables", () => {
  for (const file of sourceFiles()) {
    if (file.path === "src/lib/config.js") continue;
    const reads = [...file.text.matchAll(/import\.meta\.env(?:\??\.([A-Za-z_]+)|\b)/g)].map((match) => match[1] ?? "(whole env)");
    for (const name of reads) assert.ok(["BASE_URL", "DEV", "PROD"].includes(name), `${file.path} reads import.meta.env ${name}`);
  }
});

test("served at /pt-br/stocks/ and kept out of search results until launch", () => {
  assert.match(read("vite.config.mjs"), /base:\s*"\/pt-br\/stocks\/"/);
  assert.match(read("vite.config.mjs"), /outDir:\s*"dist\/client"/);
  const html = read("index.html");
  assert.match(html, /<html lang="pt-BR">/);
  assert.match(html, /<meta name="robots" content="noindex" \/>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.vortexfinance\.co\/pt-br\/stocks\/" \/>/);
  for (const [, href] of html.matchAll(/href="(\/brand\/[^"]+)"/g)) assert.ok(existsSync(join(APP, "public", href)), `${href} is missing from public/`);
});

test("a simulated ramp can never show a Pix code: no EMV Pix payload anywhere in src", () => {
  for (const file of sourceFiles()) {
    assert.doesNotMatch(file.text, /["'`]000201/, `${file.path} contains an EMV payload`);
    assert.doesNotMatch(file.text, /BR\.GOV\.BCB\.PIX/i, `${file.path} contains a Pix merchant id`);
  }
});

// Reverse tabnabbing: a third-party page opened from here must not reach window.opener (this tab
// holds the Privy wallet and the Vortex session).
test("every window opened for a third party has no opener", () => {
  const files = sourceFiles();
  for (const file of files) {
    for (const match of file.text.matchAll(/window\.open\(([^)]*)\)/g)) {
      const after = file.text.slice(match.index, match.index + 400);
      assert.ok(/noopener/.test(match[1]) || /\.opener = null/.test(after), `${file.path}: ${match[0]} keeps its opener`);
    }
    for (const match of file.text.matchAll(/<a\b[^>]*\btarget=[^>]*>/g)) assert.match(match[0], /rel="[^"]*\bnoreferrer\b/, `${file.path}: ${match[0].slice(0, 80)}`);
  }
  assert.ok(files.some((file) => file.text.includes("window.open(")), "the Avenia window is still opened somewhere");
});
