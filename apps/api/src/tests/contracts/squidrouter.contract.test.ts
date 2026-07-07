/**
 * External API contract: SquidRouter (docs/features/contract-tests.md).
 *
 * The same consumed-contract schemas run against the fake (hermetic, PR-blocking)
 * and against the real public API (live, nightly). The live half needs no
 * credentials — the integrator id is baked into squidRouterConfigBase.
 *
 * The status endpoint has no live check: it requires the hash of a real, recent
 * cross-chain transaction. Its consumed surface (status, isGMPTransaction) is
 * covered hermetically.
 */
import { describe, expect, test } from "bun:test";
import {
  createGenericRouteParams,
  EvmToken,
  evmTokenConfig,
  getRoute,
  Networks,
  squidrouterRouteResponseSchema,
  squidrouterStatusResponseSchema
} from "@vortexfi/shared";
import { assertLiveCoverage, runLive } from "../../test-utils/contract-support";
import { FakeSquidRouter } from "../../test-utils/fake-world/fake-squidrouter";

const RUN_LIVE = !!process.env.RUN_LIVE_TESTS;

// Routes are quotes, nothing is executed — but Squid screens from/to addresses and
// rejects blocklisted ones with a 403 "swaps are currently unavailable" (the well-known
// hardhat dev address is blocked, for example). Use an unremarkable placeholder.
const TEST_ADDRESS = "0x1234567890123456789012345678901234567890";

// Mirrors the cross-chain onramp leg (USDC on Polygon → USDT on Arbitrum) using the
// same param builder production uses, so the live request has production shape.
function buildRouteParams() {
  const fromToken = evmTokenConfig[Networks.Polygon]?.[EvmToken.USDC]?.erc20AddressSourceChain;
  const toToken = evmTokenConfig[Networks.Arbitrum]?.[EvmToken.USDT]?.erc20AddressSourceChain;
  if (!fromToken || !toToken) {
    throw new Error("Token config no longer contains the Polygon USDC / Arbitrum USDT pair");
  }
  return createGenericRouteParams({
    amount: "10000000", // 10 USDC in raw units
    destinationAddress: TEST_ADDRESS,
    fromAddress: TEST_ADDRESS,
    fromNetwork: Networks.Polygon,
    fromToken,
    toNetwork: Networks.Arbitrum,
    toToken
  });
}

describe("SquidRouter external API contract — hermetic (fake)", () => {
  test("fake route output satisfies the consumed route contract", async () => {
    const fake = new FakeSquidRouter();
    const result = await fake.getRoute(buildRouteParams());
    expect(() => squidrouterRouteResponseSchema.parse(result.data)).not.toThrow();
  });

  test("fake status output satisfies the consumed status contract", async () => {
    const fake = new FakeSquidRouter();
    const status = await fake.getStatus();
    expect(() => squidrouterStatusResponseSchema.parse(status)).not.toThrow();
  });
});

describe.skipIf(!RUN_LIVE)("SquidRouter external API contract — live", () => {
  test(
    "POST /v2/route response satisfies the consumed route contract",
    async () => {
      const result = await runLive("squidrouter getRoute", () => getRoute(buildRouteParams()));
      if (!result) return; // inconclusive — see test-utils/contract-support.ts
      squidrouterRouteResponseSchema.parse(result.data);
    },
    60_000
  );
});

test.skipIf(!RUN_LIVE)("live contract coverage actually ran", () => {
  assertLiveCoverage();
});
