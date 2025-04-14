import { EventListener, RampPhase, decodeSubmittableExtrinsic } from 'shared';
import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';

import { ApiManager } from '../../pendulum/apiManager';
import { StateMetadata } from '../meta-state-types';
import Big from 'big.js';

import { checkBalancePeriodically } from '../../stellar/checkBalance';
import { createVaultService } from '../../stellar/vaultService';

const maxWaitingTimeMinutes = 10;
const maxWaitingTimeMs = maxWaitingTimeMinutes * 60 * 1000;

export class SpacewalkRedeemPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return 'spacewalkRedeem';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const networkName = 'pendulum';
    const pendulumNode = await apiManager.getApi(networkName);

    const {
      pendulumEphemeralAddress,
      outputAmountBeforeFees,
      stellarTarget,
      executeSpacewalkNonce,
      stellarEphemeralAccountId,
    } = state.state as StateMetadata;

    if (
      !pendulumEphemeralAddress ||
      !outputAmountBeforeFees ||
      !stellarTarget ||
      !executeSpacewalkNonce ||
      !stellarEphemeralAccountId
    ) {
      throw new Error('SpacewalkRedeemPhaseHandler: State metadata corrupted. This is a bug.');
    }

    try {
      const { txData: spacewalkRedeemTransaction } = this.getPresignedTransaction(state, 'spacewalkRedeem');

      const accountData = await pendulumNode.api.query.system.account(pendulumEphemeralAddress);
      const currentEphemeralAccountNonce = await accountData.nonce.toNumber();

      // Re-execution guard
      if (currentEphemeralAccountNonce !== undefined && currentEphemeralAccountNonce > executeSpacewalkNonce) {
        await this.waitForOutputTokensToArriveOnStellar(
          outputAmountBeforeFees.units,
          stellarEphemeralAccountId,
          stellarTarget.stellarTokenDetails.stellarAsset.code.string,
        );
        return this.transitionToNextPhase(state, 'stellarPayment');
      }

      const vaultService = await createVaultService(
        pendulumNode,
        stellarTarget.stellarTokenDetails.stellarAsset.code.hex,
        stellarTarget.stellarTokenDetails.stellarAsset.issuer.hex,
        outputAmountBeforeFees.raw,
      );
      console.log(`Requesting redeem of ${outputAmountBeforeFees.units} tokens for vault ${vaultService.vaultId}`);

      const redeemExtrinsic = decodeSubmittableExtrinsic(spacewalkRedeemTransaction, pendulumNode.api);
      const redeemRequestEvent = await vaultService.submitRedeem(pendulumEphemeralAddress, redeemExtrinsic);

      console.log(`Successfully posed redeem request ${redeemRequestEvent.redeemId} for vault ${vaultService.vaultId}`);

      // TODO we may want to use a singleton for the event listener across the backend.
      const eventListener = EventListener.getEventListener(pendulumNode.api);
      await eventListener.waitForRedeemExecuteEvent(redeemRequestEvent.redeemId, maxWaitingTimeMs);

      return this.transitionToNextPhase(state, 'stellarPayment');
    } catch (e) {
      // This is a potentially recoverable error (due to redeem request done before app shut down, but not registered)
      if ((e as Error).message.includes('AmountExceedsUserBalance')) {
        console.log(`Recovery mode: Redeem already performed. Waiting for execution and Stellar balance arrival.`);
        await this.waitForOutputTokensToArriveOnStellar(
          outputAmountBeforeFees.units,
          stellarEphemeralAccountId,
          stellarTarget.stellarTokenDetails.stellarAsset.code.string,
        );
        return this.transitionToNextPhase(state, 'stellarPayment');
      } else {
        // Generic failure of the extrinsic itself OR lack of funds to even make the transaction
        console.log(`Failed to request redeem: ${e}`);
        throw new Error(`Failed to request redeem`);
      }
    }
  }

  private async waitForOutputTokensToArriveOnStellar(
    outputAmountUnits: string,
    targetAccount: string,
    stellarAssetCode: string,
  ): Promise<void> {
    // We wait for up to 10 minutes

    const amountUnitsBig = new Big(outputAmountUnits);
    const stellarPollingTimeMs = 1000;

    try {
      await checkBalancePeriodically(
        targetAccount,
        stellarAssetCode,
        amountUnitsBig,
        stellarPollingTimeMs,
        maxWaitingTimeMs,
      );
      console.log('Balance check completed successfully.');
    } catch (balanceCheckError) {
      throw new Error(`Stellar balance did not arrive on time`);
    }
  }
}

export default new SpacewalkRedeemPhaseHandler();
