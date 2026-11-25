import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { recoverTransactionAddress } from "viem";

const stored = new Map();
globalThis.localStorage = {
  getItem: key => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, value)
};
globalThis.window = {
  addEventListener: () => undefined,
  dispatchEvent: () => true,
  localStorage: globalThis.localStorage,
  removeEventListener: () => undefined
};

const resolved = import.meta.resolve("@vortexfi/sdk");
if (!resolved.endsWith("/dist/browser/index.js")) {
  throw new Error(`Expected the browser SDK artifact, resolved ${resolved}`);
}
const artifact = await readFile(new URL(resolved), "utf8");
if (artifact.includes("fs/promises")) {
  throw new Error("Browser SDK artifact must not contain Node filesystem imports");
}

// Importing @polkadot/api starts its WASM in Node, but bundlers drop that side effect, so the cold
// registration below can pass here and still fail in an app. Check the artifact itself: crypto must
// come from the bundle, never from the external API package.
const apiImports = [...artifact.matchAll(/import\s*([^;"]*?)\s*from\s*"@polkadot\/api[^"]*"/g)].flatMap(([, clause]) =>
  clause
    .replace(/[{}]/g, "")
    .split(",")
    .map(name => name.trim().split(" ")[0])
);
assert.deepEqual(
  [...new Set(apiImports)].sort(),
  ["ApiPromise", "WsProvider"],
  "The browser SDK may only take the RPC client from @polkadot/api"
);

const { VortexSdk } = await import("@vortexfi/sdk");
try {
  new VortexSdk({ apiBaseUrl: "https://api.example", secretKey: "sk_test_browser_leak" });
  throw new Error("Expected browser secretKey configuration to fail");
} catch (error) {
  if (!String(error).includes("must not configure secretKey")) throw error;
}

// Web/Service Workers have no `window`; the browser artifact must still reject secret keys.
const windowStub = globalThis.window;
delete globalThis.window;
try {
  new VortexSdk({ apiBaseUrl: "https://api.example", secretKey: "sk_test_worker_leak" });
  throw new Error("Expected browser-build secretKey configuration to fail without window");
} catch (error) {
  if (!String(error).includes("must not configure secretKey")) throw error;
} finally {
  globalThis.window = windowStub;
}

// Exercise the real browser artifact before any explicit initialization of Polkadot.
// Source tests can share one WASM instance even when the packaged SDK does not.
const owner = "0x1234567890123456789012345678901234567890";
const routes = [
  { from: "base", id: "buy-stock-usdc", inputAmount: "25", inputCurrency: "USDC", rampType: "BUY", to: "robinhood" },
  { from: "robinhood", id: "sell-stock-usdc", outputCurrency: "USDC", rampType: "SELL", to: "base" },
  { from: "pix", id: "buy-stock-pix", inputAmount: "150", inputCurrency: "BRL", rampType: "BUY", to: "robinhood" }
];
const registrationSdk = new VortexSdk({
  accessTokenProvider: async () => "test-token",
  apiBaseUrl: "https://api.example",
  offrampFundingMode: "deferred"
});
const originalFetch = globalThis.fetch;
const generatedAddresses = new Set();
try {
  for (const quote of routes) {
    const isPix = quote.from === "pix";
    const id = `ramp-${quote.id}`;
    const network = quote.rampType === "SELL" ? "robinhood" : "base";
    const chainId = network === "base" ? 8453 : 4663;
    const rpcOrigin = network === "base" ? "https://mainnet.base.org" : "https://rpc.mainnet.chain.robinhood.com";
    const permit = { network, nonce: 0, phase: "stockPermitTransfer", signer: owner };
    const calls = [];
    let unsignedTxs;
    globalThis.fetch = async (url, { method, body, headers }) => {
      const { origin, pathname } = new URL(url);
      if (origin === rpcOrigin) {
        const rpc = JSON.parse(body);
        assert.equal(rpc.method, "eth_chainId", "Presigning must not broadcast or request wallet approval");
        return Response.json({ id: rpc.id, jsonrpc: "2.0", result: `0x${chainId.toString(16)}` });
      }
      assert.equal(origin, "https://api.example");
      assert.equal(headers.Authorization, "Bearer test-token");
      calls.push(`${method} ${pathname}`);
      if (pathname === `/v1/quotes/${quote.id}`) return Response.json(quote);
      if (pathname === "/v1/brla/getUserRemainingLimit") return Response.json({ remainingLimit: 200 });
      const request = JSON.parse(body);
      if (pathname === "/v1/ramp/register") {
        assert.equal(request.quoteId, quote.id);
        assert.equal(request.additionalData.destinationAddress, owner);
        assert.deepEqual(
          request.signingAccounts.map(account => account.type),
          ["Substrate", "EVM"]
        );
        for (const { address, type } of request.signingAccounts) {
          assert.match(address, type === "EVM" ? /^0x[0-9a-f]{40}$/i : /^[1-9A-HJ-NP-Za-km-z]{47,49}$/);
          assert.ok(!generatedAddresses.has(address), "Each registration should generate fresh accounts");
          generatedAddresses.add(address);
        }
        const evm = request.signingAccounts.find(account => account.type === "EVM");
        const ephemeralTx = {
          meta: {},
          network,
          nonce: 0,
          phase: "destinationTransfer",
          signer: evm.address,
          txData: { data: "0x", gas: "21000", to: owner, value: "0" }
        };
        unsignedTxs = isPix ? [ephemeralTx] : [ephemeralTx, permit];
        return Response.json({ id, unsignedTxs });
      }
      assert.equal(pathname, "/v1/ramp/update", "Registration must not start or broadcast the order");
      assert.equal(request.rampId, id);
      assert.ok(stored.has(`ephemerals_${id}.json`), "Keys must be stored before presigned transactions are submitted");
      assert.equal(request.presignedTxs.length, 1, "The customer's authorization must remain unsigned");
      assert.equal(request.presignedTxs[0].signer, unsignedTxs[0].signer);
      const signer = await recoverTransactionAddress({ serializedTransaction: request.presignedTxs[0].txData });
      assert.equal(signer.toLowerCase(), unsignedTxs[0].signer.toLowerCase());
      return Response.json({ id, unsignedTxs });
    };
    const result = await registrationSdk.registerRamp(quote, { destinationAddress: owner, walletAddress: owner });
    assert.equal(result.rampProcess.id, id);
    assert.deepEqual(result.unsignedTransactions, isPix ? [] : [permit]);
    assert.deepEqual(calls, [
      ...(isPix ? [`GET /v1/quotes/${quote.id}`, "GET /v1/brla/getUserRemainingLimit"] : []),
      "POST /v1/ramp/register",
      "POST /v1/ramp/update"
    ]);
  }
} finally {
  globalThis.fetch = originalFetch;
}

const sdk = new VortexSdk({ apiBaseUrl: "https://api.example" });
await sdk.storeEphemerals(
  {
    EVM: { address: "0xephemeral", secret: "test-secret" }
  },
  "browser-smoke"
);

if (!stored.has("ephemerals_browser-smoke.json")) {
  throw new Error("Expected browser ephemeral keys to be stored in localStorage");
}

globalThis.localStorage.setItem = () => {
  throw new Error("storage unavailable");
};
try {
  await sdk.storeEphemerals({ EVM: { address: "0xephemeral", secret: "test-secret" } }, "storage-failure");
  throw new Error("Expected browser storage failure to propagate");
} catch (error) {
  if (!String(error).includes("storage unavailable")) throw error;
}
