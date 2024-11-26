import { beforeEach, describe, expect, it } from 'vitest';
import { getRouteTransactionRequest, testRoute } from '../route';
import { INPUT_TOKEN_CONFIG, InputTokenDetails } from '../../../constants/tokenConfig';
import { createSquidRouterHash } from '../../../helpers/crypto';
import { createRandomString } from '../../../helpers/crypto';

// We need to add a delay to the beforeEach hook to ensure that the test does not run before the SquidRouter API is ready
beforeEach(() => {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, 2000);
  });
});

describe('Squidrouter', () => {
  describe('should be able to get route for relevant USDC tokens', () => {
    function getRouteForToken(inputToken: InputTokenDetails) {
      // These addresses don't really matter
      const userAddress = '0x7Ba99e99Bc669B3508AFf9CC0A898E869459F877';
      const somePayload =
        '0x00000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000180000000000000000000000000000000000000000000000000000000003b9aca00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000002082e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000148d0bbba567ae73a06a8678e53dc7add0af6b7039000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000005000000082e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000220180fb9b50c5b785126981757bce1b7bf047e3b0eaa3cda2b8983ae35443294b3900000000000000000000000000000000000000000000000000000000000000';
      const squidRouterReceiverId = createRandomString(32);
      const squidRouterHash = createSquidRouterHash(squidRouterReceiverId, somePayload);
      const amount = '1000000000';

      return getRouteTransactionRequest(userAddress, amount, squidRouterHash, inputToken);
    }

    async function testRouteForToken(inputToken: InputTokenDetails) {
      const userAddress = '0x7Ba99e99Bc669B3508AFf9CC0A898E869459F877' as `0x${string}`;
      const amount = '1000000000';
      return testRoute(inputToken, amount, userAddress);
    }

    it('should successfully query a route for USDC', async () => {
      const inputToken = INPUT_TOKEN_CONFIG.Polygon.usdc;
      const route = await getRouteForToken(inputToken!);

      expect(route).toBeDefined();
      expect(route.requestId).toBeDefined();
      expect(route.data).toBeDefined();

      // Test the testRoute function
      await expect(testRouteForToken(inputToken!)).resolves.not.toThrow();
    });

    it('should successfully query a route for USDC.e', async () => {
      const inputToken = INPUT_TOKEN_CONFIG.Polygon.usdce;
      const route = await getRouteForToken(inputToken!);

      expect(route).toBeDefined();
      expect(route.requestId).toBeDefined();
      expect(route.data).toBeDefined();

      // Test the testRoute function
      await expect(testRouteForToken(inputToken!)).resolves.not.toThrow();
    });
  });
});
