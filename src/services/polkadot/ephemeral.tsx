import { Keyring } from '@polkadot/api';
import { mnemonicGenerate } from '@polkadot/util-crypto';
import { waitForTransactionReceipt } from '@wagmi/core';
import axios from 'axios';
import Big from 'big.js';

import { getPendulumCurrencyId, getInputTokenDetails } from '../../constants/tokenConfig';
import { SIGNING_SERVICE_URL } from '../../constants/constants';
import { multiplyByPowerOfTen } from '../../helpers/contracts';
import { waitUntilTrue } from '../../helpers/function';
import { ExecutionContext, OfframpingState } from '../offrampingFlow';
import { fetchSigningServiceAccountId } from '../signingService';
import { isHashRegistered } from '../moonbeam';
import { usePendulumNode } from '../../contexts/polkadotNode';

const FUNDING_AMOUNT_UNITS = '0.1';

export function useGetEphemeralAddress() {
  const pendulumNode = usePendulumNode();

  return async ({ pendulumEphemeralSeed }: OfframpingState) => {
    if (!pendulumNode) {
      throw new Error('Pendulum node not available');
    }

    const keyring = new Keyring({ type: 'sr25519', ss58Format: pendulumNode.ss58Format });
    const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);
    return ephemeralKeypair.address;
  };
}

export function useGetEphemeralNonce() {
  const pendulumNode = usePendulumNode();

  return async ({ pendulumEphemeralSeed }: OfframpingState): Promise<number | undefined> => {
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
  };
}

export function usePendulumFundEphemeral() {
  const isEphemeralFundedHook = useIsEphemeralFunded();
  const getEphemeralAddressHook = useGetEphemeralAddress();

  return async (state: OfframpingState, { wagmiConfig }: ExecutionContext): Promise<OfframpingState> => {
    console.log('Pendulum funding ephemeral account');
    const { squidRouterSwapHash } = state;
    if (squidRouterSwapHash === undefined) {
      throw new Error('No squid router swap hash found');
    }

    await waitForTransactionReceipt(wagmiConfig, { hash: squidRouterSwapHash });

    const isAlreadyFunded = await isEphemeralFundedHook(state);

    if (!isAlreadyFunded) {
      const ephemeralAddress = await getEphemeralAddressHook(state);
      const response = await axios.post(`${SIGNING_SERVICE_URL}/v1/pendulum/fundEphemeral`, { ephemeralAddress });

      if (response.data.status !== 'success') {
        throw new Error('Error funding ephemeral account: funding timed out or failed');
      }

      await waitUntilTrue(isEphemeralFundedHook.bind(null, state));
    }

    await waitUntilTrue(isHashRegistered.bind(null, state.squidRouterReceiverHash));

    return {
      ...state,
      phase: 'executeXCM',
    };
  };
}

export function useIsEphemeralFunded() {
  const pendulumNode = usePendulumNode();

  return async (state: OfframpingState) => {
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
  };
}

export function useCreatePendulumEphemeralSeed() {
  const pendulumNode = usePendulumNode();

  return async () => {
    const seedPhrase = mnemonicGenerate();

    if (!pendulumNode) {
      throw new Error('Pendulum node not available');
    }

    const keyring = new Keyring({ type: 'sr25519', ss58Format: pendulumNode.ss58Format });

    const ephemeralAccountKeypair = keyring.addFromUri(seedPhrase);

    console.log('Ephemeral account seedphrase: ', seedPhrase);
    console.log('Ephemeral account created:', ephemeralAccountKeypair.address);

    return { seed: seedPhrase, address: ephemeralAccountKeypair.address };
  };
}

export function usePendulumCleanup() {
  const pendulumNode = usePendulumNode();

  return async (state: OfframpingState): Promise<OfframpingState> => {
    try {
      const { pendulumEphemeralSeed, inputTokenType, outputTokenType, network } = state;
      const inputToken = getInputTokenDetails(network, inputTokenType);

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
  };
}

export function useGetRawInputBalance() {
  const pendulumNode = usePendulumNode();
  const getEphemeralAddressHook = useGetEphemeralAddress();

  return async (state: OfframpingState): Promise<Big> => {
    if (!pendulumNode) {
      throw new Error('Pendulum node not available');
    }

    const { api } = pendulumNode;

    const inputToken = getInputTokenDetails(state.network, state.inputTokenType);

    const balanceResponse = await api.query.tokens.accounts(
      await getEphemeralAddressHook(state),
      inputToken.pendulumCurrencyId,
    );

    const inputBalanceRaw = Big(balanceResponse?.free?.toString() ?? '0');

    return inputBalanceRaw;
  };
}

export function useGetRawOutputBalance() {
  const pendulumNode = usePendulumNode();
  const getEphemeralAddressHook = useGetEphemeralAddress();

  return async (state: OfframpingState): Promise<Big> => {
    if (!pendulumNode) {
      throw new Error('Pendulum node not available');
    }

    const { api } = pendulumNode;

    const pendulumCurrencyId = getPendulumCurrencyId(state.outputTokenType);

    const balanceResponse = await api.query.tokens.accounts(await getEphemeralAddressHook(state), pendulumCurrencyId);

    const outputBalanceRaw = Big(balanceResponse?.free?.toString() ?? '0');

    return outputBalanceRaw;
  };
}

export function useSubsidizePreSwap() {
  const getRawInputBalanceHook = useGetRawInputBalance();
  const getEphemeralAddressHook = useGetEphemeralAddress();

  return async (state: OfframpingState): Promise<OfframpingState> => {
    const currentBalance = await getRawInputBalanceHook(state);
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
        body: JSON.stringify({
          address: await getEphemeralAddressHook(state),
          amountRaw: requiredAmount.toFixed(0, 0),
        }),
      });

      if (!response.ok) {
        throw new Error(`Error while subsidizing pre-swap: ${response.statusText}`);
      }

      await waitUntilTrue(async () => {
        const currentBalance = await getRawInputBalanceHook(state);
        return currentBalance.gte(Big(state.inputAmount.raw));
      });
    }

    return {
      ...state,
      phase: 'nablaApprove',
    };
  };
}

export function useSubsidizePostSwap() {
  const getRawOutputBalanceHook = useGetRawOutputBalance();
  const getEphemeralAddressHook = useGetEphemeralAddress();

  return async (state: OfframpingState): Promise<OfframpingState> => {
    const currentBalance = await getRawOutputBalanceHook(state);
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
          address: await getEphemeralAddressHook(state),
          amountRaw: requiredAmount.toFixed(0, 0),
          token: state.outputTokenType,
        }),
      });

      if (!response.ok) {
        throw new Error(`Error while subsidizing post-swap: ${response.statusText}`);
      }

      await waitUntilTrue(async () => {
        const currentBalance = await getRawOutputBalanceHook(state);
        return currentBalance.gte(Big(state.outputAmount.raw));
      });
    }

    return {
      ...state,
      phase: 'executeSpacewalkRedeem',
    };
  };
}
