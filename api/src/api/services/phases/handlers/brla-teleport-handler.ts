import Big from 'big.js';
import { FiatToken, getAnyFiatTokenDetailsMoonbeam, RampPhase } from 'shared';

import RampState from '../../../../models/rampState.model';
import { StateMetadata } from '../meta-state-types';
import { BasePhaseHandler } from '../base-phase-handler';
import { BrlaApiService } from '../../brla/brlaApiService';
import { checkMoonbeamBalancePeriodically } from '../../moonbeam/balance';
import { BrlaTeleportService } from '../../brla/brlaTeleportService';

export class BrlaTeleportPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return 'brlaTeleport';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const { taxId, moonbeamEphemeralAddress, inputAmountUnits, inputAmountBeforeSwapRaw } =
      state.state as StateMetadata;

    if (!taxId || !moonbeamEphemeralAddress || !inputAmountUnits || !inputAmountBeforeSwapRaw) {
      throw new Error('BrlaTeleportPhaseHandler: State metadata corrupted. This is a bug.');
    }

    try {
      const inputAmountBrla = new Big(inputAmountUnits).mul(100); // BRLA understands raw amount with 2 decimal places.

      const brlaApiService = BrlaApiService.getInstance();
      const subaccount = await brlaApiService.getSubaccount(taxId);

      if (!subaccount) {
        throw new Error('Subaccount not found');
      }
      console.log('Requesting teleport:', subaccount.id, inputAmountBrla, moonbeamEphemeralAddress);
      const teleportService = BrlaTeleportService.getInstance();
      await teleportService.requestTeleport(
        subaccount.id,
        Number(inputAmountBrla),
        moonbeamEphemeralAddress as `0x${string}`,
      );

      // now we wait and verify that funds have arrived at the actual destination ephemeral.
    } catch (e) {
      console.error('Error in brlaTeleport', e);
      throw new Error('BrlaTeleportPhaseHandler: Failed to trigger BRLA pay in.');
    }

    try {
      const pollingTimeMs = 1000;
      const maxWaitingTimeMs = 5 * 60 * 1000; // 5 minutes

      const tokenDetails = getAnyFiatTokenDetailsMoonbeam(FiatToken.BRL);

      await checkMoonbeamBalancePeriodically(
        tokenDetails.moonbeamErc20Address,
        moonbeamEphemeralAddress,
        inputAmountBeforeSwapRaw, // TODO verify this is okay, regarding decimals.
        pollingTimeMs,
        maxWaitingTimeMs,
      );
    } catch (balanceCheckError) {
      if (balanceCheckError instanceof Error) {
        if (balanceCheckError.message === 'Balance did not meet the limit within the specified time') {
          throw new Error(`BrlaTeleportPhaseHandler: balanceCheckError ${balanceCheckError.message}`);
        } else {
          console.log('Error checking Moonbeam balance:', balanceCheckError);
          throw new Error(`BrlaTeleportPhaseHandler: Error checking Moonbeam balance`);
        }
      }
    }

    return this.transitionToNextPhase(state, 'moonbeamToPendulumXcm');
  }
}

export default new BrlaTeleportPhaseHandler();
