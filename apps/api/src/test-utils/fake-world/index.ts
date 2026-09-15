import { ApiManager } from "@vortexfi/shared";
import { type FakeAlfredpay, type FakeBrla, type FakeMykobo, installFakeAnchors } from "./fake-anchors";
import { installBackgroundWorkTracking } from "./fake-background-work";
import { type FakeEvm, installFakeEvm } from "./fake-evm";
import { type FakeMonerium, installFakeMonerium } from "./fake-monerium";
import { type FakePrices, installFakePrices } from "./fake-prices";
import { type FakeSquidRouter, installFakeSquidRouter } from "./fake-squidrouter";
import { installFetchGuard, uninstallFetchGuard } from "./fetch-guard";

export type { FakeAlfredpay, FakeBrla, FakeEvm, FakeMonerium, FakeMykobo, FakePrices, FakeSquidRouter };
export { installFetchGuard, uninstallFetchGuard };

export interface FakeWorld {
  evm: FakeEvm;
  mykobo: FakeMykobo;
  brla: FakeBrla;
  alfredpay: FakeAlfredpay;
  monerium: FakeMonerium;
  prices: FakePrices;
  squidRouter: FakeSquidRouter;
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
  const { fakeMonerium, restore: restoreMonerium } = installFakeMonerium();
  const { fakePrices, restore: restorePrices } = installFakePrices();
  const { fakeSquidRouter, restore: restoreSquidRouter } = installFakeSquidRouter();
  // Not an external boundary, but fire-and-forget app work (the ramp-completion email
  // enqueue) must be trackable so truncateAllTables can wait for it between tests.
  const { restore: restoreBackgroundWorkTracking } = installBackgroundWorkTracking();

  // Substrate/Pendulum flows are not faked yet; fail loudly if a code path
  // unexpectedly needs them so the gap is explicit rather than a hang.
  // Exceptions: getApi succeeds and returns an inert node, because handlers like
  // fundEphemeral resolve the Pendulum API unconditionally even on corridors
  // that never touch Substrate — only actual USE of the node should fail. The
  // one supported use is `api.query.system.account`, which the registration
  // freshness check reads for Substrate ephemerals (SDK clients always send
  // one): every account is reported fresh (nonce 0, zero balance).
  const substrateNodeUnfaked = (member: string) =>
    new Error(
      `FakeWorld: Substrate node .${member} was used but Substrate chains are not faked yet — ` +
        "extend src/test-utils/fake-world if this flow must be covered hermetically."
    );
  const freshSubstrateApi = new Proxy(
    {
      query: { system: { account: async () => ({ data: { free: "0" }, nonce: { toNumber: () => 0 } }) } }
    },
    {
      get: (obj, prop) => {
        if (prop in obj) {
          return obj[prop as keyof typeof obj];
        }
        if (prop === "then") {
          return undefined;
        }
        throw substrateNodeUnfaked(`api.${String(prop)}`);
      }
    }
  );
  const originalGetApiManager = ApiManager.getInstance;
  ApiManager.getInstance = () =>
    new Proxy(
      {},
      {
        get: (_obj, prop) => {
          if (prop === "then") {
            return undefined;
          }
          if (prop === "getApi") {
            return async () =>
              new Proxy(
                { api: freshSubstrateApi },
                {
                  get: (node, nodeProp) => {
                    if (nodeProp in node) {
                      return node[nodeProp as keyof typeof node];
                    }
                    if (nodeProp === "then") {
                      return undefined;
                    }
                    throw substrateNodeUnfaked(String(nodeProp));
                  }
                }
              );
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
    monerium: fakeMonerium,
    mykobo: fakeMykobo,
    prices: fakePrices,
    restore: () => {
      ApiManager.getInstance = originalGetApiManager;
      restoreBackgroundWorkTracking();
      restoreSquidRouter();
      restorePrices();
      restoreMonerium();
      restoreAnchors();
      restoreEvm();
      uninstallFetchGuard();
    },
    squidRouter: fakeSquidRouter
  };
}
