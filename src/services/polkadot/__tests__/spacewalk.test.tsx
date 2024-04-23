import { SpacewalkPrimitivesVaultId } from '@polkadot/types/lookup';
import { WalletAccount } from '@talismn/connect-wallets';
import { Keypair } from 'stellar-sdk';
import { Keyring } from '@polkadot/api';
import { getApiManagerInstance } from '../polkadotApi';
import { VaultService } from '../spacewalk';

const TEST_ACCOUNT_SECRET_PHRASE = process.env.TEST_ACCOUNT_SECRET_PHRASE || '';
const TEST_STELLAR_DESTINATION_ACCOUNT = process.env.TEST_STELLAR_DESTINATION_ACCOUNT || '';
const TEST_CURRENCY_SYMBOL = process.env.TEST_CURRENCY_SYMBOL || 'EURC';

describe('VaultService', () => {
  describe('redeem', () => {
    it('should successfully execute and await a redeem', async () => {
      if (!TEST_ACCOUNT_SECRET_PHRASE) {
        console.log('Skipping tests because TEST_ACCOUNT_SECRET_PHRASE is not set.');
        return;
      }
      if (!TEST_STELLAR_DESTINATION_ACCOUNT) {
        console.log('Skipping tests because TEST_STELLAR_DESTINATION_ACCOUNT is not set.');
        return;
      }

      // Create a new instance of the PolkadotApi
      const apiManager = await getApiManagerInstance();
      const apiComponents = await apiManager.getApi();
      const api = apiComponents.api;

      const vaults: SpacewalkPrimitivesVaultId[] = await api.query.vaultRegistry.vaults().then((res) => {
        console.log(res);
        return res.toJSON() as unknown as SpacewalkPrimitivesVaultId[];
      });

      const vaultsForCurrency = vaults.filter((vault) => {
        vault.currencies.wrapped.isStellar &&
          vault.currencies.wrapped.asStellar.isAlphaNum4 &&
          vault.currencies.wrapped.asStellar.asAlphaNum4.code.toString() === TEST_CURRENCY_SYMBOL;
      });

      if (!vaultsForCurrency.length) {
        console.log(`Skipping tests because no vaults found for ${TEST_CURRENCY_SYMBOL}`);
        return;
      }

      const testingVault = vaultsForCurrency[0];

      // Create polkadot.js keypair from secret phrase
      const keyring = new Keyring({ type: 'sr25519' });
      const keypair = keyring.addFromUri(TEST_ACCOUNT_SECRET_PHRASE);
      // Create a new VaultService instance
      const vaultService = new VaultService(testingVault, apiComponents);
      const walletAccount: WalletAccount = { address: keypair.address, signer: keypair, source: 'polkadot' };
      const stellarPkBytes = Keypair.fromPublicKey(TEST_STELLAR_DESTINATION_ACCOUNT).rawPublicKey();
      const amount = '100000';

      const redeem = vaultService.requestRedeem(walletAccount, amount, stellarPkBytes);
      expect(redeem).toBeInstanceOf(Promise);
    });
  });
});
