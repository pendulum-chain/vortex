import { beforeEach, describe, expect, it } from 'vitest';
import { getRouteTransactionRequest } from '../route';
import { INPUT_TOKEN_CONFIG, InputTokenDetails } from '../../../constants/tokenConfig';

// We need to add a delay to the beforeEach hook to ensure that the test does not run before the SquidRouter API is ready
beforeEach(() => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, 2000);
  });
});

describe('Squidrouter', () => {
  describe('should be able to get route for relevant USDC tokens', () => {
    function getRouteForToken(inputToken: InputTokenDetails) {
      const userAddress = '0x7Ba99e99Bc669B3508AFf9CC0A898E869459F877';
      const ephemeralAddress = '0x7Ba99e99Bc669B3508AFf9CC0A898E869459F877';
      const amount = '1000000000';

      return getRouteTransactionRequest(userAddress, amount, ephemeralAddress, inputToken);
    }

    it('should successfully query a route for USDC', async () => {
      const inputToken = INPUT_TOKEN_CONFIG.usdc;
      const route = await getRouteForToken(inputToken);

      expect(route).toBeDefined();
      expect(route.requestId).toBeDefined();
      expect(route.data).toBeDefined();
    });

    it('should successfully query a route for USDC.e', async () => {
      const inputToken = INPUT_TOKEN_CONFIG.usdce;
      const route = await getRouteForToken(inputToken);

      expect(route).toBeDefined();
      expect(route.requestId).toBeDefined();
      expect(route.data).toBeDefined();
    });
  });
});
