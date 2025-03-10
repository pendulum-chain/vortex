import { Hash } from 'viem';
import { isTransactionHashSafeWallet } from './isTransactionSafeWallet';

const safeWalletHash = '0xB12C0147eA9e2699D36d6666A5dce3f6be4e46e5' as Hash;
const polygonHash = '0x29ee0aab2b60bd28d81c28d4c1d9e22434f6f8a89ecce52025076a6e78e17b6c' as Hash;
const polygonChainId = 137;

describe('isTransactionHashSafeWallet (querying safe wallet api and polygon chain)', () => {
  it.skip('should identify regular Polygon transaction', async () => {
    const result = await isTransactionHashSafeWallet(polygonHash, polygonChainId);
    expect(result).toBe(false);
  });

  it.skip('should identify Safe wallet transaction', async () => {
    const result = await isTransactionHashSafeWallet(safeWalletHash, polygonChainId);
    expect(result).toBe(true);
  });

  it.skip('should handle invalid transaction hash', async () => {
    const invalidHash = '0x1234' as Hash;
    await expect(isTransactionHashSafeWallet(invalidHash, polygonChainId)).rejects.toBeTruthy();
  });
});
