import { readFile } from "node:fs/promises";

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
if ((await readFile(new URL(resolved), "utf8")).includes("fs/promises")) {
  throw new Error("Browser SDK artifact must not contain Node filesystem imports");
}

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
