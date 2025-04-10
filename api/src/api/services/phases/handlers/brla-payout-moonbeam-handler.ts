import Big from 'big.js';
import { getAnyFiatTokenDetailsMoonbeam, isFiatTokenEnum, RampPhase } from 'shared';

import RampState from '../../../../models/rampState.model';
import { StateMetadata } from '../meta-state-types';
import { BasePhaseHandler } from '../base-phase-handler';
import { BrlaApiService } from '../../brla/brlaApiService';
import { checkMoonbeamBalancePeriodically } from '../../moonbeam/balance';

export class BrlaPayoutOnMoonbeamPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return 'brlaPayoutOnMoonbeam';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const { taxId, pixDestination, outputAmountBeforeFees, brlaEvmAddress, outputTokenType, receiverTaxId } =
      state.state as StateMetadata;

    if (
      !taxId ||
      !pixDestination ||
      !outputAmountBeforeFees ||
      !outputAmountBeforeFees ||
      !brlaEvmAddress ||
      !outputTokenType
    ) {
      throw new Error('BrlaPayoutOnMoonbeamPhaseHandler: State metadata corrupted. This is a bug.');
    }

    if (!isFiatTokenEnum(outputTokenType)) {
      throw new Error('BrlaPayoutOnMoonbeamPhaseHandler: Invalid token type.');
    }

    const tokenDetails = getAnyFiatTokenDetailsMoonbeam(outputTokenType);

    const pollingTimeMs = 1000;
    const maxWaitingTimeMs = 5 * 60 * 1000; // 5 minutes

    try {
      await checkMoonbeamBalancePeriodically(
        tokenDetails.polygonErc20Address,
        brlaEvmAddress,
        outputAmountBeforeFees.raw,
        pollingTimeMs,
        maxWaitingTimeMs,
      );
    } catch (balanceCheckError) {
      if (balanceCheckError instanceof Error) {
        if (balanceCheckError.message === 'Balance did not meet the limit within the specified time') {
          throw new Error(`BrlaPayoutOnMoonbeamPhaseHandler: balanceCheckError ${balanceCheckError.message}`);
        } else {
          console.log('Error checking Moonbeam balance:', balanceCheckError);
          throw new Error(`Error checking Moonbeam balance`);
        }
      }
    }

    try {
      const amount = new Big(outputAmountBeforeFees.units).mul(100); // BRLA understands raw amount with 2 decimal places.

      const brlaApiService = BrlaApiService.getInstance();
      const subaccount = await brlaApiService.getSubaccount(taxId);

      if (!subaccount) {
        throw new Error('BrlaPayoutOnMoonbeamPhaseHandler: Subaccount not found.');
      }

      const subaccountId = subaccount.id;
      const { id: offrampId } = await brlaApiService.triggerOfframp(subaccountId, {
        pixKey: pixDestination,
        amount: Number(amount),
        taxId: receiverTaxId,
      });

      return this.transitionToNextPhase(state, 'complete');
    } catch (e) {
      console.error('Error in brlaPayoutOnMoonbeam', e);
      throw new Error('BrlaPayoutOnMoonbeamPhaseHandler: Failed to trigger BRLA offramp.');
    }
  }
}

export default new BrlaPayoutOnMoonbeamPhaseHandler();
