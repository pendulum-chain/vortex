import Big from 'big.js';
import { FiatToken, getAnyFiatTokenDetailsMoonbeam, RampPhase } from 'shared';

import RampState from '../../../../models/rampState.model';
import { StateMetadata } from '../meta-state-types';
import { BasePhaseHandler } from '../base-phase-handler';
import { BrlaApiService } from '../../brla/brlaApiService';
import { BalanceCheckError, BalanceCheckErrorType, checkEvmBalancePeriodically } from '../../moonbeam/balance';
import { BrlaTeleportService } from '../../brla/brlaTeleportService';
import logger from '../../../../config/logger';
import { moonbeam } from 'viem/chains';
import { generateReferenceLabel } from '../../brla/helpers';

const PAYMENT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const EVM_BALANCE_CHECK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

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
      const memo = generateReferenceLabel(state.quoteId);
      logger.info('Requesting teleport:', subaccount.id, inputAmountBrla, moonbeamEphemeralAddress, memo);
      const teleportService = BrlaTeleportService.getInstance();
      await teleportService.requestTeleport(
        subaccount.id,
        Number(inputAmountBrla),
        moonbeamEphemeralAddress as `0x${string}`,
        memo,
      );

      // now we wait and verify that funds have arrived at the actual destination ephemeral.
    } catch (e) {
      console.error('Error in brlaTeleport', e);
      throw new Error('BrlaTeleportPhaseHandler: Failed to trigger BRLA pay in.');
    }

    try {
      const pollingTimeMs = 1000;

      const tokenDetails = getAnyFiatTokenDetailsMoonbeam(FiatToken.BRL);

      await checkEvmBalancePeriodically(
        tokenDetails.moonbeamErc20Address,
        moonbeamEphemeralAddress,
        inputAmountBeforeSwapRaw, // TODO verify this is okay, regarding decimals.
        pollingTimeMs,
        EVM_BALANCE_CHECK_TIMEOUT_MS,
        moonbeam,
      );

      // Add delay to ensure the transaction is settled
      await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 seconds.
    } catch (error) {
      if (!(error instanceof BalanceCheckError)) throw error;

      const isCheckTimeout = error.type === BalanceCheckErrorType.Timeout;
      if (isCheckTimeout && this.isPaymentTimeoutReached(state)) {
        logger.error('Payment timeout:', error);
        // TODO remove entry from BrlaTeleportService
        return this.transitionToNextPhase(state, 'failed');
      }

      throw isCheckTimeout
        ? this.createRecoverableError(`BrlaTeleportPhaseHandler: ${error}`)
        : new Error(`Error checking Moonbeam balance: ${error}`);
    }

    return this.transitionToNextPhase(state, 'moonbeamToPendulumXcm');
  }

  protected isPaymentTimeoutReached(state: RampState): boolean {
    const thisPhaseEntry = state.phaseHistory.find(
      (phaseHistoryEntry) => phaseHistoryEntry.phase === this.getPhaseName(),
    );
    if (!thisPhaseEntry) {
      throw new Error('BrlaTeleportPhaseHandler: Phase not found in history. State corrupted.');
    }

    if (thisPhaseEntry.timestamp.getTime() + PAYMENT_TIMEOUT_MS < Date.now()) {
      return true;
    }
    return false;
  }
}

export default new BrlaTeleportPhaseHandler();
