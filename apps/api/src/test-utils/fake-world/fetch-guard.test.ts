import { describe, expect, it } from "bun:test";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { installFakeChainIdRpc } from "./fake-evm";

// No installFakeWorld here: the preload alone must keep viem RPC traffic off the network.
describe("fetch guard", () => {
  const client = createPublicClient({ chain: base, transport: http(undefined, { retryCount: 0 }) });

  it("rejects viem RPC calls to a real chain", async () => {
    await expect(client.getChainId()).rejects.toThrow(/Hermetic test violation/);
  });

  it("lets the fake answer eth_chainId and nothing else", async () => {
    const restore = installFakeChainIdRpc();
    try {
      expect(await client.getChainId()).toBe(base.id);
      await expect(client.getBlockNumber()).rejects.toThrow(/Hermetic test violation/);
    } finally {
      restore();
    }
  });
});
