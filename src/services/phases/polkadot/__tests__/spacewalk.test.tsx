import { describe, expect, it } from 'vitest';
import { Keypair } from 'stellar-sdk';
import { ApiPromise, Keyring } from '@polkadot/api';
import { ApiComponents } from '../../../../contexts/polkadotNode';
import { getVaultsForCurrency, VaultService } from '../spacewalk';
import { getOutputTokenDetailsSpacewalk, OutputTokenType } from '../../../../constants/tokenConfig';

// The secret phrase of a substrate account on Pendulum used for requesting a redeem
const TEST_ACCOUNT_SECRET_PHRASE = process.env.TEST_ACCOUNT_SECRET_PHRASE || '';
// The Stellar destination address used for redeeming
const TEST_STELLAR_DESTINATION_ADDRESS = process.env.TEST_STELLAR_DESTINATION_ADDRESS || '';
const TEST_CURRENCY_SYMBOL = process.env.TEST_CURRENCY_SYMBOL || 'EURC';

// Set timeout to five minutes
const TIMEOUT = 5 * 60 * 1000;

function checkRequirements(): boolean {
  if (!TEST_ACCOUNT_SECRET_PHRASE) {
    console.log('Skipping tests because TEST_ACCOUNT_SECRET_PHRASE is not set.');
    return false;
  }
  if (!TEST_STELLAR_DESTINATION_ADDRESS) {
    console.log('Skipping tests because TEST_STELLAR_DESTINATION_ADDRESS is not set.');
    return false;
  }
  return true;
}

async function setupTest(apiComponents: ApiComponents) {
  const { api } = apiComponents;

  const testToken = getOutputTokenDetailsSpacewalk(TEST_CURRENCY_SYMBOL.toLowerCase() as OutputTokenType);
  const vaultsForCurrency = await getVaultsForCurrency(
    api,
    testToken.stellarAsset.code.hex,
    testToken.stellarAsset.issuer.hex,
    '1000', // we don't mind the redeemable amount for this test.
  );
  if (vaultsForCurrency.length === 0) {
    console.log(`No vaults found for currency ${TEST_CURRENCY_SYMBOL}`);
    return;
  }
  const testingVault = vaultsForCurrency[0];

  // Create polkadot.js keypair from secret phrase
  const keyring = new Keyring({ type: 'sr25519' });
  const keypair = keyring.addFromUri(TEST_ACCOUNT_SECRET_PHRASE);

  // Create a new VaultService instance
  const vaultService = new VaultService(testingVault.id, apiComponents);
  const stellarPk = Keypair.fromPublicKey(TEST_STELLAR_DESTINATION_ADDRESS);
  const stellarPkBytes = stellarPk.rawPublicKey();

  return {
    api,
    keypair,
    vaultService,
    stellarPkBytes,
  };
}

describe('VaultService', () => {
  describe('requestRedeem', () => {
    it(
      'should successfully request a redeem',
      async () => {
        if (!checkRequirements()) return;

        const mockApiComponents = {
          api: {} as ApiPromise,
          ss58Format: 42,
          decimals: 12,
        };

        const setupComponents = await setupTest(mockApiComponents);
        if (!setupComponents) {
          return;
        }
        const { api, keypair, vaultService, stellarPkBytes } = setupComponents;

        const amount = await api.query.redeem.redeemMinimumTransferAmount();
        const amountString = amount.toString();

        const redeemRequest = await vaultService.createRequestRedeemExtrinsic(keypair, amountString, stellarPkBytes);
        expect(redeemRequest).toBeInstanceOf(Promise);

        const redeem = await vaultService.submitRedeem(keypair.address, redeemRequest);

        const redeemRequestEvent = await redeem;
        expect(redeemRequestEvent).toBeDefined();
        expect(redeemRequestEvent.redeemId).toBeDefined();
        expect(redeemRequestEvent.redeemer).toBeDefined();
        expect(redeemRequestEvent.vaultId).toBeDefined();
        expect(redeemRequestEvent.amount).toBeDefined();
        expect(redeemRequestEvent.amount).toEqual(amount.toNumber());
      },
      TIMEOUT,
    );
  });
});
