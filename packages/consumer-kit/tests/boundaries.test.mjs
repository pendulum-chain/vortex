import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const files = walk(SRC).map((path) => ({ path: relative(SRC, path).split("\\").join("/"), text: readFileSync(path, "utf8") }));
// The only files allowed to reach React and Privy: the "./privy" entry and its provider.
const PRIVY_ENTRY = ["privy/index.js", "privy/ConsumerPrivyProvider.jsx"];
const staticImports = (text) => [...text.matchAll(/^\s*(?:import|export)\s[^;]*?\bfrom\s+["']([^"']+)["']/gm), ...text.matchAll(/^\s*import\s+["']([^"']+)["']/gm)].map((match) => match[1]);

test("the eager entry never statically imports React, Privy or the SDK", () => {
  const eager = files.filter((file) => !PRIVY_ENTRY.includes(file.path));
  assert.ok(eager.some((file) => file.path === "index.js") && eager.some((file) => file.path === "privy/config.js"));
  for (const file of eager) {
    for (const specifier of staticImports(file.text)) {
      assert.ok(!/^(react|react-dom)(\/|$)/.test(specifier), `${file.path} imports ${specifier}`);
      assert.ok(!specifier.startsWith("@privy-io/"), `${file.path} imports ${specifier}`);
      assert.ok(!specifier.startsWith("@vortexfi/sdk"), `${file.path} imports ${specifier}`);
      assert.ok(!specifier.includes("/privy"), `${file.path} pulls in the privy entry via ${specifier}`);
    }
  }
});

test("the SDK is only ever loaded lazily, from vortex/client.js", () => {
  const dynamic = files.filter((file) => /import\(\s*["']@vortexfi\/sdk["']\s*\)/.test(file.text)).map((file) => file.path);
  assert.deepEqual(dynamic, ["vortex/client.js"]);
});

test("the provider is the only file importing react and Privy", () => {
  const provider = files.find((file) => file.path === "privy/ConsumerPrivyProvider.jsx");
  assert.deepEqual(staticImports(provider.text).filter((specifier) => !specifier.startsWith(".")).sort(), ["@privy-io/react-auth", "react"]);
});

test("configuration is passed in: no kit file reads import.meta.env", () => {
  for (const file of files) assert.ok(!file.text.includes("import.meta.env"), `${file.path} reads import.meta.env`);
});

test("the package entry points exist and the eager entry loads in Node", async () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(pkg.exports, { ".": "./src/index.js", "./chains": "./src/chains.js", "./privy": "./src/privy/index.js" });
  const kit = await import("../src/index.js");
  for (const name of ["SHARED_KEYS", "appKey", "local", "session", "formatBRL", "formatChange", "robinhoodChain", "withRpcOverride", "createApi", "resolveApiBase", "createVortexSession", "createVortexClient", "createBrazilKyc", "buildAveniaKycPayload", "classifyRamp", "pollRamp", "getRampWithUnsignedTxs", "sendEvmTransaction", "submitWalletTransactions", "createActiveRampStore", "createEphemeralStore", "signalLogout", "onLogoutSignal", "CONSUMER_SIGN_IN", "LEGAL_URLS"]) {
    assert.ok(name in kit, `index.js does not export ${name}`);
  }
  assert.equal("createPrivyConfig" in kit, false);
});
