import { afterEach, describe, expect, it, mock } from "bun:test";
import type { ApiPromise } from "@polkadot/api";
import { type API, ApiManager, type NetworkConfig, type SubstrateApiNetwork } from "./apiManager";

const ORIGINAL_ENV = { ...process.env };

async function loadConfiguredNetworks(): Promise<NetworkConfig[]> {
  const modulePath = `./apiManager.ts?test=${Date.now()}-${Math.random()}`;
  const { getConfiguredNetworks } = await import(modulePath);
  return getConfiguredNetworks();
}

describe("ApiManager network configuration", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("uses default RPC URLs when no overrides are configured", async () => {
    delete process.env.ASSETHUB_WSS;
    delete process.env.HYDRATION_WSS;
    delete process.env.MOONBEAM_WSS;

    const networks = await loadConfiguredNetworks();

    expect(networks.find(network => network.name === "assethub")?.wsUrls).toEqual(["wss://dot-rpc.stakeworld.io/assethub"]);
    expect(networks.find(network => network.name === "hydration")?.wsUrls).toEqual(["wss://rpc.hydradx.cloud"]);
    expect(networks.find(network => network.name === "moonbeam")?.wsUrls).toEqual([
      "wss://wss.api.moonbeam.network",
      "wss://moonbeam.api.onfinality.io/public-ws",
      "wss://moonbeam.ibp.network"
    ]);
  });

  it("uses configured RPC URL overrides", async () => {
    process.env.ASSETHUB_WSS = "wss://asset-hub.example";
    process.env.HYDRATION_WSS = "wss://hydration.example";
    process.env.MOONBEAM_WSS = "wss://moonbeam.example";

    const networks = await loadConfiguredNetworks();

    expect(networks.find(network => network.name === "assethub")?.wsUrls).toEqual(["wss://asset-hub.example"]);
    expect(networks.find(network => network.name === "hydration")?.wsUrls).toEqual(["wss://hydration.example"]);
    expect(networks.find(network => network.name === "moonbeam")?.wsUrls).toEqual(["wss://moonbeam.example"]);
  });

  it("supports comma-separated RPC URL overrides", async () => {
    process.env.MOONBEAM_WSS = "wss://moonbeam-one.example, wss://moonbeam-two.example";

    const networks = await loadConfiguredNetworks();

    expect(networks.find(network => network.name === "moonbeam")?.wsUrls).toEqual([
      "wss://moonbeam-one.example",
      "wss://moonbeam-two.example"
    ]);
  });
});

// Exposes the private members needed to drive the manager without real WS connections.
type TestableApiManager = {
  apiInstances: Map<string, API>;
  previousSpecVersions: Map<string, number>;
  connectApi: (networkName: SubstrateApiNetwork, wsUrlIndex?: number) => Promise<API>;
  populateApi: ApiManager["populateApi"];
  getApi: ApiManager["getApi"];
};

function createManager(): TestableApiManager {
  return new (ApiManager as unknown as new () => TestableApiManager)();
}

function createFakeApi(getSpecVersion: () => number): { instance: API; disconnect: ReturnType<typeof mock> } {
  const disconnect = mock(() => Promise.resolve());
  const api = {
    call: {
      core: {
        version: () => Promise.resolve({ toHuman: () => ({ specVersion: getSpecVersion() }) })
      }
    },
    disconnect,
    isConnected: true,
    isReady: Promise.resolve()
  };
  return { disconnect, instance: { api: api as unknown as ApiPromise, decimals: 12, ss58Format: 42 } };
}

describe("ApiManager api refresh", () => {
  function setupManager() {
    const manager = createManager();
    let onChainSpecVersion = 1;
    const fakes: ReturnType<typeof createFakeApi>[] = [];

    // Mimics the real connectApi: returns a fresh instance reading the current on-chain
    // spec version and records that version as the previous one.
    const connectApiMock = mock((networkName: SubstrateApiNetwork) => {
      const fake = createFakeApi(() => onChainSpecVersion);
      fakes.push(fake);
      manager.previousSpecVersions.set(networkName, onChainSpecVersion);
      return Promise.resolve(fake.instance);
    });
    manager.connectApi = connectApiMock;

    return { connectApiMock, fakes, manager, setSpecVersion: (version: number) => (onChainSpecVersion = version) };
  }

  it("populateApi is idempotent and reuses the cached instance", async () => {
    const { fakes, manager } = setupManager();

    const first = await manager.populateApi("pendulum");
    const second = await manager.populateApi("pendulum");

    expect(second).toBe(first);
    expect(manager.connectApi).toHaveBeenCalledTimes(1);
    expect(fakes[0].disconnect).not.toHaveBeenCalled();
  });

  it("getApi replaces and disconnects the cached instance when the spec version changes", async () => {
    const { fakes, manager, setSpecVersion } = setupManager();

    const initial = await manager.populateApi("pendulum");

    // Simulate a runtime upgrade on chain
    setSpecVersion(2);

    const refreshed = await manager.getApi("pendulum");

    expect(refreshed).not.toBe(initial);
    expect(manager.connectApi).toHaveBeenCalledTimes(2);
    expect(fakes[0].disconnect).toHaveBeenCalledTimes(1);
    expect(manager.apiInstances.get("pendulum-0")).toBe(refreshed);
  });

  it("keeps the cached instance when the refresh reconnect fails", async () => {
    const { connectApiMock, fakes, manager, setSpecVersion } = setupManager();

    const initial = await manager.populateApi("pendulum");

    setSpecVersion(2);
    connectApiMock.mockImplementationOnce(() => Promise.reject(new Error("reconnect failed")));

    await expect(manager.getApi("pendulum")).rejects.toThrow("reconnect failed");

    expect(manager.apiInstances.get("pendulum-0")).toBe(initial);
    expect(fakes[0].disconnect).not.toHaveBeenCalled();
  });

  it("getApi with forceRefresh replaces and disconnects the cached instance", async () => {
    const { fakes, manager } = setupManager();

    const initial = await manager.populateApi("pendulum");
    const refreshed = await manager.getApi("pendulum", true);

    expect(refreshed).not.toBe(initial);
    expect(fakes[0].disconnect).toHaveBeenCalledTimes(1);
    expect(manager.apiInstances.get("pendulum-0")).toBe(refreshed);
  });
});
