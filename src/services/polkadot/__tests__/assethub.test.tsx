import { describe, expect, it } from 'vitest';
import { createAssethubApi, createAssethubAssetTransfer } from '../assethub';

const TIMEOUT = 10000;

describe('AssetHub', () => {
  it(
    'should be able to create an AssetHub XCM transfer',
    async () => {
      const assetHubApi = await createAssethubApi();
      const receiver = '6crgzCSvCAimAEkCxctFZginxL6uUfYKijHBVsAK5WGhcJY1';
      const rawAmount = '1000000000000';
      const xcmCall = createAssethubAssetTransfer(assetHubApi, receiver, rawAmount);

      console.log('xcmCall', xcmCall.toHex());
      // We only check if it's defined. If the call is not defined, it will throw an error.
      expect(xcmCall).toBeDefined();
    },
    TIMEOUT,
  );
});
