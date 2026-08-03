import { describe, expect, it } from "bun:test";
import type { WalletClient } from "viem";
import { polygonAmoy } from "viem/chains";

// Importing ./signUnsigned pulls in the package barrel, which freezes src/constants.ts from
// process.env for the whole test run. Provide the env defaults other test files rely on before
// that happens (same pattern as alfredpayApiService.test.ts), hence the dynamic import.
process.env.ALFREDPAY_API_KEY ||= "test-key";
process.env.ALFREDPAY_API_SECRET ||= "test-secret";

const { Networks } = await import("./networks");
const { createEvmClient } = await import("./signUnsigned");

const EPHEMERAL = {
  address: "0x0000000000000000000000000000000000000000",
  secret: "0x0000000000000000000000000000000000000000000000000000000000000001"
};

function transportUrls(client: WalletClient): (string | undefined)[] {
  const transport = client.transport as unknown as { transports: { value?: { url?: string } }[] };
  return transport.transports.map(t => t.value?.url);
}

describe("createEvmClient Polygon Amoy transports", () => {
  it("prefers Alchemy for signing and keeps viem's default transport as the fallback", () => {
    const client = createEvmClient(Networks.PolygonAmoy, EPHEMERAL, "test-api-key");

    expect(transportUrls(client)).toEqual([
      "https://polygon-amoy.g.alchemy.com/v2/test-api-key",
      polygonAmoy.rpcUrls.default.http[0]
    ]);
  });

  it("uses only viem's default transport without an Alchemy API key", () => {
    const client = createEvmClient(Networks.PolygonAmoy, EPHEMERAL);

    expect(transportUrls(client)).toEqual([polygonAmoy.rpcUrls.default.http[0]]);
  });
});
