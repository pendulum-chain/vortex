import { Keyring } from '@polkadot/api';
import { mnemonicGenerate } from '@polkadot/util-crypto';
import { getApiManagerInstance } from './polkadotApi';
import { getPendulumCurrencyId, INPUT_TOKEN_CONFIG } from '../../constants/tokenConfig';
import Big from 'big.js';
import { ExecutionContext, OfframpingState } from '../offrampingFlow';
import { waitForEvmTransaction } from '../evmTransactions';
import axios from 'axios';

// TODO: replace
const SEED_PHRASE = 'hood protect select grace number hurt lottery property stomach grit bamboo field';

export async function pendulumFundEphemeral(
  state: OfframpingState,
  { wagmiConfig }: ExecutionContext,
): Promise<OfframpingState> {
  console.log('Pendulum funding ephemeral account');
  const { squidRouterSwapHash, pendulumEphemeralSeed } = state;
  if (squidRouterSwapHash === undefined) {
    throw new Error('No squid router swap hash found');
  }

  await waitForEvmTransaction(squidRouterSwapHash, wagmiConfig);

  try {
    const pendulumApiComponents = await getApiManagerInstance();
    const apiData = pendulumApiComponents.apiData!;
    const keyring = new Keyring({ type: 'sr25519', ss58Format: apiData.ss58Format });
    const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);
    const response = await axios.post('/api/v1/fundEphemeral',{ ephemeralAddress: ephemeralKeypair.address });

    if (response.data.status === 'success') {
      await waitForInputTokenToArrive(state);

      return {
        ...state,
        phase: 'nablaApprove',
      };
    } else {
      throw new Error('Funding timed out or failed');
    }
  } catch (error) {
    console.error('Error funding ephemeral account:', error);
  }

  return { ...state, phase: 'failure' };
}

async function waitForInputTokenToArrive(state: OfframpingState) {
  console.log('Waiting for input token to arrive on pendulum');
  while (true) {
    const isFunded = await didInputTokenArriveOnPendulum(state);
    if (isFunded) {
      console.log('Input token arrived on pendulum');
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export async function createPendulumEphemeralSeed() {
  const seedPhrase = mnemonicGenerate();

  const pendulumApiComponents = await getApiManagerInstance();
  const apiData = pendulumApiComponents.apiData!;
  const keyring = new Keyring({ type: 'sr25519', ss58Format: apiData.ss58Format });

  const ephemeralAccountKeypair = keyring.addFromUri(seedPhrase);
  console.log('Ephemeral account seedphrase: ', seedPhrase);
  console.log('Ephemeral account created:', ephemeralAccountKeypair.address);

  return seedPhrase;
}

export async function pendulumCleanup(state: OfframpingState): Promise<OfframpingState> {
  try {
    const { pendulumEphemeralSeed, inputTokenType, outputTokenType } = state;
    const inputToken = INPUT_TOKEN_CONFIG[inputTokenType];

    const pendulumApiComponents = await getApiManagerInstance();
    const { api, ss58Format } = pendulumApiComponents.apiData!;

    const keyring = new Keyring({ type: 'sr25519', ss58Format });
    const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);
    const fundingAccountAddress = keyring.addFromUri(SEED_PHRASE).address;

    // probably will never be exactly '0', but to be safe
    // TODO: if the value is too small, do we really want to transfer token dust and spend fees?
    const inputCurrencyId = inputToken.axelarEquivalent.pendulumCurrencyId;
    const outputCurrencyId = getPendulumCurrencyId(outputTokenType);

    await api.tx.utility
      .batchAll([
        api.tx.tokens.transferAll(fundingAccountAddress, inputCurrencyId, false),
        api.tx.tokens.transferAll(fundingAccountAddress, outputCurrencyId, false),
        api.tx.balances.transferAll(fundingAccountAddress, false),
      ])
      .signAndSend(ephemeralKeypair);
  } catch (error) {
    console.error('Error cleaning pendulum ephemeral account', error);
  }

  return { ...state, phase: 'stellarOfframp' };
}

async function didInputTokenArriveOnPendulum({
  inputAmountNabla,
  pendulumEphemeralSeed,
  inputTokenType,
}: OfframpingState): Promise<boolean> {
  const pendulumApiComponents = await getApiManagerInstance();
  const { api, ss58Format } = pendulumApiComponents.apiData!;

  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);
  const inputToken = INPUT_TOKEN_CONFIG[inputTokenType];

  const balanceResponse = (await api.query.tokens.accounts(
    ephemeralKeypair.address,
    inputToken.axelarEquivalent.pendulumCurrencyId,
  )) as any;

  console.log('Balance response', balanceResponse.toString(), inputAmountNabla);
  const inputBalanceRaw = Big(balanceResponse?.free?.toString() ?? '0');

  return inputBalanceRaw.gte(Big(inputAmountNabla.raw));
}
