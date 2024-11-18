/* eslint-disable @typescript-eslint/no-explicit-any */
import { Keyring } from '@polkadot/api';
import { mnemonicGenerate } from '@polkadot/util-crypto';
import { waitForTransactionReceipt } from '@wagmi/core';
import axios from 'axios';
import Big from 'big.js';

import { getInputTokenDetails, getPendulumCurrencyId, INPUT_TOKEN_CONFIG } from '../../constants/tokenConfig';
import { SIGNING_SERVICE_URL } from '../../constants/constants';
import { multiplyByPowerOfTen } from '../../helpers/contracts';
import { waitUntilTrue } from '../../helpers/function';
import { ExecutionContext, OfframpingState } from '../offrampingFlow';
import { fetchSigningServiceAccountId } from '../signingService';
import { isHashRegistered } from '../moonbeam';
import { getApiManagerInstance } from './polkadotApi';

const FUNDING_AMOUNT_UNITS = '0.1';

async function getEphemeralAddress({ pendulumEphemeralSeed }: OfframpingState) {
  const pendulumApiComponents = await getApiManagerInstance();
  const apiData = pendulumApiComponents.apiData!;
  const keyring = new Keyring({ type: 'sr25519', ss58Format: apiData.ss58Format });
  const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);
  return ephemeralKeypair.address;
}

export async function getEphemeralNonce({ pendulumEphemeralSeed }: OfframpingState): Promise<number | undefined> {
  const pendulumApiComponents = await getApiManagerInstance();
  const apiData = pendulumApiComponents.apiData!;

  const keyring = new Keyring({ type: 'sr25519', ss58Format: apiData.ss58Format });
  const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);

  try {
    const accountData = await apiData.api.query.system.account(ephemeralKeypair.address);
    return accountData.nonce.toNumber();
  } catch (error) {
    console.error(`Can't request nonce of ephemeral account ${ephemeralKeypair.address}`);
    return undefined;
  }
}

export async function pendulumFundEphemeral(
  state: OfframpingState,
  { wagmiConfig }: ExecutionContext,
): Promise<OfframpingState> {
  console.log('Pendulum funding ephemeral account');
  const { squidRouterSwapHash } = state;

  if (state.network !== 'AssetHub') {
    if (squidRouterSwapHash === undefined) {
      throw new Error('No squid router swap hash found');
    }

    await waitForTransactionReceipt(wagmiConfig, { hash: squidRouterSwapHash });
  }

  const isAlreadyFunded = await isEphemeralFunded(state);

  if (!isAlreadyFunded) {
    const ephemeralAddress = await getEphemeralAddress(state);
    const response = await axios.post(`${SIGNING_SERVICE_URL}/v1/pendulum/fundEphemeral`, { ephemeralAddress });

    if (response.data.status !== 'success') {
      throw new Error('Error funding ephemeral account: funding timed out or failed');
    }

    await waitUntilTrue(isEphemeralFunded.bind(null, state));
  }

  await waitUntilTrue(isHashRegistered.bind(null, state.squidRouterReceiverHash));

  return {
    ...state,
    phase: 'executeMoonbeamXCM',
  };
}

async function isEphemeralFunded(state: OfframpingState) {
  const { pendulumEphemeralSeed } = state;
  const pendulumApiComponents = await getApiManagerInstance();
  const apiData = pendulumApiComponents.apiData!;

  const keyring = new Keyring({ type: 'sr25519', ss58Format: apiData.ss58Format });
  const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);

  const fundingAmountUnits = Big(FUNDING_AMOUNT_UNITS);
  const fundingAmountRaw = multiplyByPowerOfTen(fundingAmountUnits, apiData.decimals).toFixed();

  const { data: balance } = await apiData.api.query.system.account(ephemeralKeypair.address);
  console.log('Funding amount', balance, balance.free.toString());

  // check if balance is higher than minimum required, then we consider the account ready
  return Big(balance.free.toString()).gte(fundingAmountRaw);
}

export async function createPendulumEphemeralSeed() {
  const seedPhrase = mnemonicGenerate();

  const pendulumApiComponents = await getApiManagerInstance();
  const apiData = pendulumApiComponents.apiData!;
  const keyring = new Keyring({ type: 'sr25519', ss58Format: apiData.ss58Format });

  const ephemeralAccountKeypair = keyring.addFromUri(seedPhrase);

  console.log('Ephemeral account seedphrase: ', seedPhrase);
  console.log('Ephemeral account created:', ephemeralAccountKeypair.address);

  return { seed: seedPhrase, address: ephemeralAccountKeypair.address };
}

export async function pendulumCleanup(state: OfframpingState): Promise<OfframpingState> {
  try {
    const { pendulumEphemeralSeed, inputTokenType, outputTokenType, network } = state;
    const inputToken = getInputTokenDetails(network, inputTokenType);

    const pendulumApiComponents = await getApiManagerInstance();
    const { api, ss58Format } = pendulumApiComponents.apiData!;

    const keyring = new Keyring({ type: 'sr25519', ss58Format });
    const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);

    const fundingAccountAddress = (await fetchSigningServiceAccountId()).pendulum.public;

    // probably will never be exactly '0', but to be safe
    // TODO: if the value is too small, do we really want to transfer token dust and spend fees?
    const inputCurrencyId = inputToken.pendulumCurrencyId;
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

export async function getRawInputBalance(state: OfframpingState): Promise<Big> {
  const pendulumApiComponents = await getApiManagerInstance();
  const { api } = pendulumApiComponents.apiData!;

  const inputToken = getInputTokenDetails(state.network, state.inputTokenType);
  const balanceResponse = (await api.query.tokens.accounts(
    await getEphemeralAddress(state),
    inputToken.pendulumCurrencyId,
  )) as any;

  const inputBalanceRaw = Big(balanceResponse?.free?.toString() ?? '0');

  return inputBalanceRaw;
}

async function getRawOutputBalance(state: OfframpingState): Promise<Big> {
  const pendulumApiComponents = await getApiManagerInstance();
  const { api } = pendulumApiComponents.apiData!;

  const pendulumCurrencyId = getPendulumCurrencyId(state.outputTokenType);

  const balanceResponse = (await api.query.tokens.accounts(
    await getEphemeralAddress(state),
    pendulumCurrencyId,
  )) as any;

  const outputBalanceRaw = Big(balanceResponse?.free?.toString() ?? '0');

  return outputBalanceRaw;
}

export async function subsidizePreSwap(state: OfframpingState): Promise<OfframpingState> {
  const currentBalance = await getRawInputBalance(state);
  if (currentBalance.eq(Big(0))) {
    throw new Error('Invalid phase: input token did not arrive yet on pendulum');
  }

  const requiredAmount = Big(state.inputAmount.raw).sub(currentBalance);
  if (requiredAmount.gt(Big(0))) {
    console.log('Subsidizing pre-swap with', requiredAmount.toString());

    const response = await fetch(`${SIGNING_SERVICE_URL}/v1/subsidize/preswap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address: await getEphemeralAddress(state), amountRaw: requiredAmount.toFixed(0, 0) }),
    });

    if (!response.ok) {
      throw new Error(`Error while subsidizing pre-swap: ${response.statusText}`);
    }

    await waitUntilTrue(async () => {
      const currentBalance = await getRawInputBalance(state);
      return currentBalance.gte(Big(state.inputAmount.raw));
    });
  }

  return {
    ...state,
    phase: 'nablaApprove',
  };
}

export async function subsidizePostSwap(state: OfframpingState): Promise<OfframpingState> {
  const currentBalance = await getRawOutputBalance(state);
  if (currentBalance.eq(Big(0))) {
    throw new Error('Invalid phase: output token has not been swapped yet');
  }

  const requiredAmount = Big(state.outputAmount.raw).sub(currentBalance);
  if (requiredAmount.gt(Big(0))) {
    console.log('Subsidizing post-swap with', requiredAmount.toString());

    const response = await fetch(`${SIGNING_SERVICE_URL}/v1/subsidize/postswap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: await getEphemeralAddress(state),
        amountRaw: requiredAmount.toFixed(0, 0),
        token: state.outputTokenType,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error while subsidizing post-swap: ${response.statusText}`);
    }

    await waitUntilTrue(async () => {
      const currentBalance = await getRawOutputBalance(state);
      return currentBalance.gte(Big(state.outputAmount.raw));
    });
  }

  return {
    ...state,
    phase: 'executeSpacewalkRedeem',
  };
}
