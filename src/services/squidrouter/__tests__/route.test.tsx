import { beforeEach, describe, expect, it } from 'vitest';
import { createRouteParams, getRouteApiPlus } from '../route';
import { TOKEN_CONFIG } from '../../../constants/tokenConfig';

// We need to add a delay to the beforeEach hook to ensure that the test does not run before the SquidRouter API is ready
beforeEach(() => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, 5000);
  });
});

describe('Squidrouter', () => {
  describe('route', () => {
    function getRouteForToken(baseToken: string) {
      const userAddress = '0x7Ba99e99Bc669B3508AFf9CC0A898E869459F877';
      const amount = '1000000000';

      const params = createRouteParams(userAddress, baseToken, amount);

      return getRouteApiPlus(params);
    }

    it('should successfully query a route for USDC', async () => {
      const usdcAddress = TOKEN_CONFIG.usdc.erc20AddressNativeChain as string;
      const route = await getRouteForToken(usdcAddress);

      expect(route).toBeDefined();
      expect(route.requestId).toBeDefined();
      expect(route.data).toBeDefined();
    });

    it('should successfully query a route for USDC.e', async () => {
      const usdcAddress = TOKEN_CONFIG.usdce.erc20AddressNativeChain as string;
      const route = await getRouteForToken(usdcAddress);

      expect(route).toBeDefined();
      expect(route.requestId).toBeDefined();
      expect(route.data).toBeDefined();
    });
  });
});
