



import Big from 'big.js';
import { FiatToken, getAnyFiatTokenDetailsMoonbeam, isFiatTokenEnum, RampPhase } from 'shared';

import RampState from '../../../../models/rampState.model';
import { StateMetadata } from '../meta-state-types';
import { BasePhaseHandler } from '../base-phase-handler';
import { BrlaApiService } from '../../brla/brlaApiService';
import { checkMoonbeamBalancePeriodically } from '../../moonbeam/balance';
import { BrlaTeleportService } from '../../brla/brlaTeleportService';



export class CreatePayInPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return 'createPayInRequest';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    
    const { 
        taxId,
        destinationAddress,
        inputAmountUnits,
        inputAmountBeforeSwapRaw,
      } = state.state as StateMetadata;
    

    if (!taxId || !destinationAddress || !inputAmountUnits || !inputAmountBeforeSwapRaw) {
        throw new Error('CreatePayInPhaseHandler: State metadata corrupted. This is a bug.');
    }

    try {
        const inputAmountBrla = new Big(inputAmountUnits).mul(100); // BRLA understands raw amount with 2 decimal places.

        const brlaApiService = BrlaApiService.getInstance();
        const subaccount = await brlaApiService.getSubaccount(taxId);
        
        if (!subaccount) {
            throw new Error('Subaccount not found' );
        }
        console.log('Requesting teleport:', subaccount.id, inputAmountBrla, destinationAddress);
        const teleportService = BrlaTeleportService.getInstance();
        await teleportService.requestTeleport(subaccount.id, Number(destinationAddress), destinationAddress as `0x${string}`);

        // now we wait until and verify that funds have arrived at the actual destination ephemeral. 
    } catch (e) {
        console.error('Error in createPayIn', e);
        throw new Error('CreatePayInPhaseHandler: Failed to trigger BRLA pay in.');
    }

    try {
        const pollingTimeMs = 1000;
        const maxWaitingTimeMs = 5 * 60 * 1000; // 5 minutes

        const tokenDetails = getAnyFiatTokenDetailsMoonbeam(FiatToken.BRL);

        await checkMoonbeamBalancePeriodically(
            tokenDetails.moonbeamErc20Address,
            destinationAddress,
            inputAmountBeforeSwapRaw,// TODO verify this is okay, regarding decimals.
            pollingTimeMs,
            maxWaitingTimeMs,
      );

    } catch (balanceCheckError) {

      if (balanceCheckError instanceof Error) {
        if (balanceCheckError.message === 'Balance did not meet the limit within the specified time') {
          throw new Error(`CreatePayInPhaseHandler: balanceCheckError ${balanceCheckError.message}`);
        } else {
          console.log('Error checking Moonbeam balance:', balanceCheckError);
          throw new Error(`CreatePayInPhaseHandler: Error checking Moonbeam balance`);
        }
      }
    }

    return this.transitionToNextPhase(state, 'moonbeamToPendulum');
  }

}

export default new CreatePayInPhaseHandler();

