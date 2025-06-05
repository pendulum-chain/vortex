import { u8aToHex } from '@polkadot/util';
import { decodeAddress } from '@polkadot/util-crypto';
import { readContract } from '@wagmi/core';
import Big from 'big.js';
import { RampPhase } from 'shared';
import { encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { moonbeam } from 'viem/chains';

import splitReceiverABI from '../../../../../../mooncontracts/splitReceiverABI.json';
import logger from '../../../../config/logger';
import { MOONBEAM_EXECUTOR_PRIVATE_KEY, MOONBEAM_RECEIVER_CONTRACT_ADDRESS } from '../../../../constants/constants';
import RampState from '../../../../models/rampState.model';
import { waitUntilTrue } from '../../../helpers/functions';
import { createMoonbeamClientsAndConfig } from '../../moonbeam/createServices';
import { ApiManager } from '../../pendulum/apiManager';
import encodePayload from '../../transactions/squidrouter/payload';
import { BasePhaseHandler } from '../base-phase-handler';
import { StateMetadata } from '../meta-state-types';

export class MoonbeamToPendulumPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return 'moonbeamToPendulum';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const pendulumNode = await apiManager.getApi('pendulum');

    const {
      pendulumEphemeralAddress,
      inputTokenPendulumDetails,
      moonbeamXcmTransactionHash,
      squidRouterReceiverId,
      squidRouterReceiverHash,
    } = state.state as StateMetadata;

    if (
      !pendulumEphemeralAddress ||
      !inputTokenPendulumDetails ||
      !squidRouterReceiverId ||
      !squidRouterReceiverId ||
      !squidRouterReceiverHash
    ) {
      throw new Error('MoonbeamToPendulumPhaseHandler: State metadata corrupted. This is a bug.');
    }

    const pendulumEphemeralAccountHex = u8aToHex(decodeAddress(pendulumEphemeralAddress));
    const squidRouterPayload = encodePayload(pendulumEphemeralAccountHex);

    const didInputTokenArrivedOnPendulum = async () => {
      const balanceResponse = await pendulumNode.api.query.tokens.accounts(
        pendulumEphemeralAddress,
        inputTokenPendulumDetails.pendulumCurrencyId,
      );
      const currentBalance = Big(balanceResponse?.free?.toString() ?? '0');
      return currentBalance.gt(Big(0));
    };

    const isHashRegisteredInSplitReceiver = async () => {
      const result = (await readContract(moonbeamConfig, {
        abi: splitReceiverABI,
        chainId: moonbeam.id,
        address: MOONBEAM_RECEIVER_CONTRACT_ADDRESS,
        functionName: 'xcmDataMapping',
        args: [squidRouterReceiverHash],
      })) as bigint;

      return result > 0n;
    };

    const moonbeamExecutorAccount = privateKeyToAccount(MOONBEAM_EXECUTOR_PRIVATE_KEY as `0x${string}`);
    const { walletClient, publicClient, moonbeamConfig } = createMoonbeamClientsAndConfig(moonbeamExecutorAccount);

    try {
      if (!(await didInputTokenArrivedOnPendulum())) {
        await waitUntilTrue(isHashRegisteredInSplitReceiver);
      }
    } catch (e) {
      logger.error(e);
      throw new Error('MoonbeamToPendulumPhaseHandler: Failed to wait for hash registration in split receiver.');
    }

    let obtainedHash: string | undefined = moonbeamXcmTransactionHash;
    try {
      if (!(await didInputTokenArrivedOnPendulum())) {
        if (moonbeamXcmTransactionHash === undefined) {
          const data = encodeFunctionData({
            abi: splitReceiverABI,
            functionName: 'executeXCM',
            args: [squidRouterReceiverId, squidRouterPayload],
          });

          const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();
          obtainedHash = await walletClient.sendTransaction({
            to: MOONBEAM_RECEIVER_CONTRACT_ADDRESS,
            value: 0n,
            data,
            maxFeePerGas,
            maxPriorityFeePerGas,
          });

          // We want to store the `moonbeamXcmTransactionHash` immediately in the local storage
          // and not just after this function call here would usually end (i.e. after the
          // tokens arrived on Pendulum).
          // For recovery purposes.
          state.state = {
            ...state.state,
            moonbeamXcmTransactionHash: obtainedHash,
          };
          await state.update({ state: state.state });
        }
      }
    } catch (e) {
      console.error('Error while executing moonbeam split contract transaction:', e);
      throw new Error('MoonbeamToPendulumPhaseHandler: Failed to send XCM transaction');
    }

    try {
      await waitUntilTrue(didInputTokenArrivedOnPendulum, 5000);
    } catch (e) {
      console.error('Error while waiting for transaction receipt:', e);
      throw new Error('MoonbeamToPendulumPhaseHandler: Failed to wait for tokens to arrive on Pendulum.');
    }

    return this.transitionToNextPhase(state, 'distributeFees');
  }
}

export default new MoonbeamToPendulumPhaseHandler();
