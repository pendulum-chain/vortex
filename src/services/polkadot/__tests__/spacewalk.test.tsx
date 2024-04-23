import { WalletAccount } from '@talismn/connect-wallets';
import { Keypair } from 'stellar-sdk';
import { Keyring } from '@polkadot/api';
import { getApiManagerInstance } from '../polkadotApi';
import { VaultService } from '../spacewalk';

const TEST_ACCOUNT_SECRET_PHRASE = process.env.TEST_ACCOUNT_SECRET_PHRASE || '';
const TEST_STELLAR_DESTINATION_ADDRESS = process.env.TEST_STELLAR_DESTINATION_ADDRESS || '';
const TEST_CURRENCY_SYMBOL = process.env.TEST_CURRENCY_SYMBOL || 'EURC';

// Set timeout to five minutes
const TIMEOUT = 5 * 60 * 1000;

describe('VaultService', () => {
  describe('redeem', () => {
    it(
      'should successfully execute and await a redeem',
      async () => {
        if (!TEST_ACCOUNT_SECRET_PHRASE) {
          console.log('Skipping tests because TEST_ACCOUNT_SECRET_PHRASE is not set.');
          return;
        }
        if (!TEST_STELLAR_DESTINATION_ADDRESS) {
          console.log('Skipping tests because TEST_STELLAR_DESTINATION_ADDRESS is not set.');
          return;
        }

        // Create a new instance of the PolkadotApi
        const apiManager = await getApiManagerInstance();
        const apiComponents = await apiManager.getApi();
        const api = apiComponents.api;

        const vaultEntries = await api.query.vaultRegistry.vaults.entries();
        const vaults = vaultEntries.map(([key, value]) => value.unwrap());

        const vaultsForCurrency = vaults.filter((vault) => {
          return (
            vault.id.currencies.wrapped.isStellar &&
            vault.id.currencies.wrapped.asStellar.isAlphaNum4 &&
            vault.id.currencies.wrapped.asStellar.asAlphaNum4.code.toHuman() === TEST_CURRENCY_SYMBOL
          );
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
        const vaultService = new VaultService(testingVault.id, apiComponents);
        const walletAccount: WalletAccount = { address: keypair.address, signer: keypair, source: 'polkadot' };
        const stellarPk = Keypair.fromPublicKey(TEST_STELLAR_DESTINATION_ADDRESS);
        const stellarPkBytes = stellarPk.rawPublicKey();

        const amount = '100000';

        const redeem = vaultService.requestRedeem(walletAccount, amount, stellarPkBytes);
        expect(redeem).toBeInstanceOf(Promise);

        const redeemRequestEvent = await redeem;
        expect(redeemRequestEvent).toBeDefined();
        expect(redeemRequestEvent.redeemId).toBeDefined();
        expect(redeemRequestEvent.redeemer).toBeDefined();
        expect(redeemRequestEvent.vaultId).toBeDefined();
        expect(redeemRequestEvent.amount).toBeDefined();
      },
      TIMEOUT,
    );
  });
});
