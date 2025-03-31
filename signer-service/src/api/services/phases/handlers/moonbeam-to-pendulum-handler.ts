

import Big from 'big.js';
import { RampPhase } from 'shared';
import { waitForTransactionReceipt } from '@wagmi/core';
import { moonbeam } from 'viem/chains';
import { encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { u8aToHex } from '@polkadot/util';
import { decodeAddress } from '@polkadot/util-crypto';

import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';
import { StateMetadata } from '../meta-state-types';
import { ApiManager } from '../../pendulum/apiManager';
import encodePayload from '../../transactions/squidrouter/payload';
import { MOONBEAM_EXECUTOR_PRIVATE_KEY, MOONBEAM_RECEIVER_CONTRACT_ADDRESS } from '../../../../constants/constants';
import { createMoonbeamClientsAndConfig } from '../../moonbeam/createServices';
import splitReceiverABI from '../../../../../../mooncontracts/splitReceiverABI.json';
import { waitUntilTrue } from '../../../helpers/functions';


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
      } = state.state as StateMetadata;
    
    
    if (!pendulumEphemeralAddress || !inputTokenPendulumDetails || !squidRouterReceiverId || !squidRouterReceiverId) {
        throw new Error('MoonbeamToPendulumPhaseHandler: State metadata corrupted. This is a bug.');
    }

    const pendulumEphemeralAccountHex = u8aToHex(decodeAddress(pendulumEphemeralAddress));
    const squidRouterPayload = encodePayload(pendulumEphemeralAccountHex);

    const didInputTokenArrivedOnPendulum = async () => {
      const balanceResponse = await pendulumNode.api.query.tokens.accounts(pendulumEphemeralAddress, inputTokenPendulumDetails.pendulumCurrencyId);
      const currentBalance = Big(balanceResponse?.free?.toString() ?? '0');
      return currentBalance.gt(Big(0));
    };

    const moonbeamExecutorAccount = privateKeyToAccount(MOONBEAM_EXECUTOR_PRIVATE_KEY as `0x${string}`);
    const { walletClient, publicClient, moonbeamConfig } = createMoonbeamClientsAndConfig(moonbeamExecutorAccount);

    try {
    
      if (!(await didInputTokenArrivedOnPendulum())) {

        if (moonbeamXcmTransactionHash === undefined) {
          const data = encodeFunctionData({
            abi: splitReceiverABI,
            functionName: 'executeXCM',
            args: [squidRouterReceiverId, squidRouterPayload],
          });

          const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();
          const hash = await walletClient.sendTransaction({
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
            moonbeamXcmTransactionHash: hash,
          };
          await state.update({ state: state.state });
        }
      }

    } catch (e) {
      console.error('Error while executing moonbeam split contract transaction:', e);
      throw new Error('MoonbeamToPendulumPhaseHandler: Failed to send XCM transaction');
    }


    try {

      await waitForTransactionReceipt(moonbeamConfig, { hash: moonbeamXcmTransactionHash as `0x${string}`, chainId: moonbeam.id }); 
      await waitUntilTrue(didInputTokenArrivedOnPendulum, 5000);

    } catch (e) {
      console.error('Error while waiting for transaction receipt:', e);
      throw new Error('MoonbeamToPendulumPhaseHandler: Failed to wait for tokens to arrive on Pendulum.');
    }

    return this.transitionToNextPhase(state, 'subsidizePreSwap');
  }

}

export default new MoonbeamToPendulumPhaseHandler();

