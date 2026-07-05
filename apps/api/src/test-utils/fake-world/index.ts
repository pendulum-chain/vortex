import { ApiManager } from "@vortexfi/shared";
import { type FakeAlfredpay, type FakeBrla, type FakeMykobo, installFakeAnchors } from "./fake-anchors";
import { type FakeEvm, installFakeEvm } from "./fake-evm";
import { type FakePrices, installFakePrices } from "./fake-prices";
import { installFetchGuard, uninstallFetchGuard } from "./fetch-guard";

export type { FakeAlfredpay, FakeBrla, FakeEvm, FakeMykobo, FakePrices };
export { installFetchGuard, uninstallFetchGuard };

export interface FakeWorld {
  evm: FakeEvm;
  mykobo: FakeMykobo;
  brla: FakeBrla;
  alfredpay: FakeAlfredpay;
  prices: FakePrices;
  restore: () => void;
}

/**
 * Replaces every external boundary of the API with deterministic in-memory
 * fakes and installs the fetch guard so nothing can slip through to a real
 * service. Call once in beforeAll and restore() in afterAll — bun runs all
 * test files in one process, so leaked patches bleed into other files.
 */
export function installFakeWorld(): FakeWorld {
  installFetchGuard();
  const { fakeEvm, restore: restoreEvm } = installFakeEvm();
  const { fakeAlfredpay, fakeBrla, fakeMykobo, restore: restoreAnchors } = installFakeAnchors();
  const { fakePrices, restore: restorePrices } = installFakePrices();

  // Substrate/Pendulum flows are not faked yet; fail loudly if a code path
  // unexpectedly needs them so the gap is explicit rather than a hang.
  const originalGetApiManager = ApiManager.getInstance;
  ApiManager.getInstance = () =>
    new Proxy(
      {},
      {
        get: (_obj, prop) => {
          if (prop === "then") {
            return undefined;
          }
          throw new Error(
            `FakeWorld: ApiManager.${String(prop)} was called but Substrate chains are not faked yet — ` +
              "extend src/test-utils/fake-world if this flow must be covered hermetically."
          );
        }
      }
    ) as unknown as ApiManager;

  return {
    alfredpay: fakeAlfredpay,
    brla: fakeBrla,
    evm: fakeEvm,
    mykobo: fakeMykobo,
    prices: fakePrices,
    restore: () => {
      ApiManager.getInstance = originalGetApiManager;
      restorePrices();
      restoreAnchors();
      restoreEvm();
      uninstallFetchGuard();
    }
  };
}
