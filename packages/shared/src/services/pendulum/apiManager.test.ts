import { afterEach, describe, expect, it } from "bun:test";
import type { NetworkConfig } from "./apiManager";

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
