import { waitForTransactionReceipt } from '@wagmi/core';
import axios from 'axios';
import Big from 'big.js';

import { mnemonicGenerate } from '@polkadot/util-crypto';
import { ApiPromise, Keyring } from '@polkadot/api';

import {
  getInputTokenDetails,
  getInputTokenDetailsOrDefault,
  getPendulumCurrencyId,
} from '../../../constants/tokenConfig';
import { SIGNING_SERVICE_URL } from '../../../constants/constants';

import { multiplyByPowerOfTen } from '../../../helpers/contracts';
import { waitUntilTrue } from '../../../helpers/function';
import { isNetworkEVM } from '../../../helpers/networks';

import { ExecutionContext, OfframpingState } from '../../offrampingFlow';
import { fetchSigningServiceAccountId } from '../../signingService';
import { isHashRegistered } from '../moonbeam';

const FUNDING_AMOUNT_UNITS = '0.1';

async function isEphemeralFunded(state: OfframpingState, context: ExecutionContext) {
  const { pendulumNode } = context;
  const { pendulumEphemeralSeed } = state;
  if (!pendulumNode) {
    throw new Error('Pendulum node not available');
  }

  const keyring = new Keyring({ type: 'sr25519', ss58Format: pendulumNode.ss58Format });
  const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);

  const fundingAmountUnits = Big(FUNDING_AMOUNT_UNITS);
  const fundingAmountRaw = multiplyByPowerOfTen(fundingAmountUnits, pendulumNode.decimals).toFixed();

  const { data: balance } = await pendulumNode.api.query.system.account(ephemeralKeypair.address);
  console.log('Funding amount', balance, balance.free.toString());

  // check if balance is higher than minimum required, then we consider the account ready
  return Big(balance.free.toString()).gte(fundingAmountRaw);
}

export async function getEphemeralAddress(state: OfframpingState, context: ExecutionContext) {
  const { pendulumNode } = context;
  const { pendulumEphemeralSeed } = state;

  if (!pendulumNode) {
    throw new Error('Pendulum node not available');
  }

  const { ss58Format } = pendulumNode;

  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);
  return ephemeralKeypair.address;
}

export async function getEphemeralNonce(
  state: OfframpingState,
  context: ExecutionContext,
): Promise<number | undefined> {
  const { pendulumNode } = context;
  const { pendulumEphemeralSeed } = state;

  if (!pendulumNode) {
    throw new Error('Pendulum node not available');
  }

  const keyring = new Keyring({ type: 'sr25519', ss58Format: pendulumNode.ss58Format });
  const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);

  try {
    const accountData = await pendulumNode.api.query.system.account(ephemeralKeypair.address);
    return accountData.nonce.toNumber();
  } catch (error) {
    console.error(`Can't request nonce of ephemeral account ${ephemeralKeypair.address}`);
    return undefined;
  }
}

export async function pendulumFundEphemeral(
  state: OfframpingState,
  context: ExecutionContext,
): Promise<OfframpingState> {
  console.log('Pendulum funding ephemeral account');
  const { squidRouterSwapHash } = state;
  const { wagmiConfig } = context;

  if (isNetworkEVM(state.network)) {
    if (squidRouterSwapHash === undefined) {
      throw new Error('No squid router swap hash found');
    }

    await waitForTransactionReceipt(wagmiConfig, { hash: squidRouterSwapHash });
  }

  const isAlreadyFunded = await isEphemeralFunded(state, context);

  if (!isAlreadyFunded) {
    const ephemeralAddress = await getEphemeralAddress(state, context);
    const response = await axios.post(`${SIGNING_SERVICE_URL}/v1/pendulum/fundEphemeral`, { ephemeralAddress });

    if (response.data.status !== 'success') {
      throw new Error('Error funding ephemeral account: funding timed out or failed');
    }

    await waitUntilTrue(() => isEphemeralFunded(state, context));
  }

  if (isNetworkEVM(state.network)) {
    await waitUntilTrue(() => isHashRegistered(state.squidRouterReceiverHash));
  }

  return {
    ...state,
    phase: isNetworkEVM(state.network) ? 'executeMoonbeamToPendulumXCM' : 'executeAssetHubToPendulumXCM',
  };
}

export async function createPendulumEphemeralSeed(pendulumNode: {
  ss58Format: number;
  api: ApiPromise;
  decimals: number;
}) {
  const seedPhrase = mnemonicGenerate();

  if (!pendulumNode) {
    throw new Error('Pendulum node not available');
  }

  const keyring = new Keyring({ type: 'sr25519', ss58Format: pendulumNode.ss58Format });

  const ephemeralAccountKeypair = keyring.addFromUri(seedPhrase);

  console.log('Ephemeral account seedphrase: ', seedPhrase);
  console.log('Ephemeral account created:', ephemeralAccountKeypair.address);

  return { seed: seedPhrase, address: ephemeralAccountKeypair.address };
}

export async function pendulumCleanup(state: OfframpingState, context: ExecutionContext): Promise<OfframpingState> {
  const { pendulumNode } = context;

  try {
    const { pendulumEphemeralSeed, inputTokenType, outputTokenType, network } = state;
    const inputToken = getInputTokenDetailsOrDefault(network, inputTokenType);

    if (!pendulumNode) {
      throw new Error('Pendulum node not available');
    }

    const { api, ss58Format } = pendulumNode;

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

export async function getRawInputBalance(state: OfframpingState, context: ExecutionContext): Promise<Big> {
  const { pendulumNode } = context;

  if (!pendulumNode) {
    throw new Error('Pendulum node not available');
  }

  const { api } = pendulumNode;

  const inputToken = getInputTokenDetailsOrDefault(state.network, state.inputTokenType);

  console.log('getRawInputBalance address: ', await getEphemeralAddress(state, context));
  const balanceResponse = await api.query.tokens.accounts(
    await getEphemeralAddress(state, context),
    inputToken.pendulumCurrencyId,
  );

  const inputBalanceRaw = Big(balanceResponse?.free?.toString() ?? '0');

  return inputBalanceRaw;
}

export async function getRawOutputBalance(state: OfframpingState, context: ExecutionContext): Promise<Big> {
  const { pendulumNode } = context;

  if (!pendulumNode) {
    throw new Error('Pendulum node not available');
  }

  const { api } = pendulumNode;

  const pendulumCurrencyId = getPendulumCurrencyId(state.outputTokenType);

  const balanceResponse = await api.query.tokens.accounts(
    await getEphemeralAddress(state, context),
    pendulumCurrencyId,
  );

  const outputBalanceRaw = Big(balanceResponse?.free?.toString() ?? '0');

  return outputBalanceRaw;
}

export async function subsidizePreSwap(state: OfframpingState, context: ExecutionContext): Promise<OfframpingState> {
  const currentBalance = await getRawInputBalance(state, context);
  if (currentBalance.eq(Big(0))) {
    throw new Error('Invalid phase: input token did not arrive yet on pendulum');
  }
  const inputToken = getInputTokenDetails(state.network, state.inputTokenType);
  if (!inputToken) {
    throw new Error('Invalid input token');
  }

  const requiredAmount = Big(state.pendulumAmountRaw).sub(currentBalance);
  if (requiredAmount.gt(Big(0))) {
    console.log('Subsidizing pre-swap with', requiredAmount.toString());

    const response = await fetch(`${SIGNING_SERVICE_URL}/v1/subsidize/preswap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: await getEphemeralAddress(state, context),
        amountRaw: requiredAmount.toFixed(0, 0),
        tokenToSubsidize: inputToken.pendulumAssetSymbol,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error while subsidizing pre-swap: ${response.statusText}`);
    }

    await waitUntilTrue(async () => {
      console.log('waiting for input balance to be enough');
      const currentBalance = await getRawInputBalance(state, context);
      console.log('currentBalance', currentBalance, Big(state.pendulumAmountRaw));
      return currentBalance.gte(Big(state.pendulumAmountRaw));
    });
  }

  return {
    ...state,
    phase: 'nablaApprove',
  };
}

export async function subsidizePostSwap(state: OfframpingState, context: ExecutionContext): Promise<OfframpingState> {
  const currentBalance = await getRawOutputBalance(state, context);
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
        address: await getEphemeralAddress(state, context),
        amountRaw: requiredAmount.toFixed(0, 0),
        token: state.outputTokenType,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error while subsidizing post-swap: ${response.statusText}`);
    }

    await waitUntilTrue(async () => {
      const currentBalance = await getRawOutputBalance(state, context);
      return currentBalance.gte(Big(state.outputAmount.raw));
    });
  }

  if (state.outputTokenType === 'brl') {
    return {
      ...state,
      phase: 'executePendulumToMoonbeamXCM',
    };
  }

  return {
    ...state,
    phase: 'executeSpacewalkRedeem',
  };
}
