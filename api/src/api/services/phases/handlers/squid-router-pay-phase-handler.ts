import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';
import logger from '../../../../config/logger';
import { RampPhase } from 'shared';
import { createPublicClient, encodeFunctionData, http } from 'viem';
import { moonbeam } from 'viem/chains';
import { getStatus } from '../../transactions/squidrouter/route';
import { axelarGasService } from '../../../../contracts/AxelarGasService';
import { privateKeyToAccount } from 'viem/accounts';
import { MOONBEAM_FUNDING_PRIVATE_KEY } from '../../../../constants/constants';
import { createMoonbeamClientsAndConfig } from '../../moonbeam/createServices';
import { multiplyByPowerOfTen } from '../../pendulum/helpers';
import Big from 'big.js';

interface GpmFeeResult {
  result: {
    source_base_fee: number;
    source_express_fee: {
      express_gas_overhead_fee: number;
      relayer_fee: number;
      relayer_fee_usd: number;
      express_gas_overhead_fee_usd: number;
      total: number;
      total_usd: number;
    };
    base_fee: number;
    base_fee_usd: number;
    execute_gas_multiplier: number;
    execute_min_gas_price: string;
    source_base_fee_string: string;
    source_base_fee_usd: number;
    destination_base_fee: number;
    destination_base_fee_string: string;
    destination_base_fee_usd: number;
    source_confirm_fee: number;
    destination_confirm_fee: number;
    express_supported: boolean;
    express_fee: number;
    express_fee_string: string;
    express_fee_usd: number;
    express_execute_gas_multiplier: number;
  };
}
interface AxelarScanStatusResponse {
  is_insufficient_fee: boolean;
  status: string; // executed or express_executed (for complete).
  fees: {
    base_fee: number; // in units of the native token.
    source_base_fee: number;
    destination_base_fee: number;
    source_express_fee: {
      total: number;
    };
    destination_express_fee: {
      total: number;
    };
  };

  id: string; // the id of the swap.
}

const AXELAR_POLLING_INTERVAL_MS = 10000; // 10 seconds
const AXL_GAS_SERVICE_MOONBEAM = '0x2d5d7d31F671F86C782533cc367F14109a082712';
/**
 * Handler for the squidRouter pay phase. Checks the status of the Axelar bridge and pays on native GLMR fee if.
 */
export class SquidRouterPayPhaseHandler extends BasePhaseHandler {
  private publicClient: ReturnType<typeof createPublicClient>;
  private walletClient: ReturnType<typeof createMoonbeamClientsAndConfig>['walletClient'];

  constructor() {
    super();
    this.publicClient = createPublicClient({
      chain: moonbeam,
      transport: http(),
    });
    const moonbeamExecutorAccount = privateKeyToAccount(MOONBEAM_FUNDING_PRIVATE_KEY as `0x${string}`);
    const { walletClient } = createMoonbeamClientsAndConfig(moonbeamExecutorAccount);
    this.walletClient = walletClient;
  }

  /**
   * Get the phase name
   */
  public getPhaseName(): RampPhase {
    return 'squidrouterPay';
  }

  /**
   * Execute the phase
   * @param state The current ramp state
   * @returns The updated ramp state
   */
  protected async executePhase(state: RampState): Promise<RampState> {
    logger.info(`Executing squidRouterPay phase for ramp ${state.id}`);

    if (state.type === 'off') {
      logger.info(`SquidRouter phase is not supported for off-ramp`);
      return state;
    }

    try {
      // Get the bridge hash
      const bridgeCallHash = state.state.squidrouterSwapHash;
      if (!bridgeCallHash) {
        throw new Error(
          'SquidRouterPayPhaseHandler: Missing bridge hash in state for squidRouterPay phase. State corrupted.',
        );
      }

      // Enter check status loop
      await this.checkStatus(state, bridgeCallHash);

      return this.transitionToNextPhase(state, 'complete');
    } catch (error: any) {
      logger.error(`SquidRouterPayPhaseHandler: Error in squidRouterPay phase for ramp ${state.id}:`, error);
      throw error;
    }
  }

  /**
   * Gets the status of the Axelar bridge
   * @param txHash The swap (bridgeCall) transaction hash
   */
  private async checkStatus(state: RampState, swapHash: string): Promise<void> {
    try {
      // const _ = await getStatus(swapHash); // Found to be unreliable. Returned "not found" for valid transactions.

      let isExecuted = false;
      let payTxHash: string | undefined = state.state.squidrouterPayTxHash; // in case of recovery, we may have already paid.
      while (!isExecuted) {
        const axelarScanStatus = await this.getStatusAxelarScan(swapHash);

        //no status found is considered a recoverable error.
        if (!axelarScanStatus) {
          logger.warn(`SquidRouterPayPhaseHandler: No status found for swap hash ${swapHash}.`);
          throw this.createRecoverableError('No status found for swap hash.');
        }
        if (axelarScanStatus.status === 'executed' || axelarScanStatus.status === 'express_executed') {
          isExecuted = true;
          logger.info(`SquidRouterPayPhaseHandler: Transaction ${swapHash} successfully executed on Axelar.`);
          break;
        }

        if (!payTxHash) {
          const feeResponse = await this.fetchFees(state.to.toString());

          if (!feeResponse) {
            logger.warn(`SquidRouterPayPhaseHandler: No status found for swap hash ${swapHash}.`);
            throw this.createRecoverableError('No status found for swap hash.');
          }

          const glmrToFundUnits = (
            feeResponse.result.source_base_fee +
            feeResponse.result.destination_base_fee +
            feeResponse.result.express_fee
          ).toString();

          const logIndex = Number(axelarScanStatus.id.split('_')[2]);
          payTxHash = await this.executeFundTransaction(glmrToFundUnits, swapHash as `0x${string}`, logIndex);

          await state.update({
            state: {
              ...state.state,
              squidrouterPayTxHash: payTxHash,
            },
          });
        }

        await new Promise((resolve) => setTimeout(resolve, AXELAR_POLLING_INTERVAL_MS));
      }
    } catch (error) {
      if (error && (error as any).isRecoverable) {
        throw error;
      }
      throw new Error(`SquidRouterPayPhaseHandler: Error waiting checking for Axelar bridge transaction: ${error}`);
    }
  }

  /**
   * Execute a call to the Axelar gas service and fund the bridge process.
   * @param glmrUnits The amount of GLMR to fund the transaction with.
   * @returns Hash of the transaction that funds the Axelar gas service.
   */
  private async executeFundTransaction(glmrUnits: string, swapHash: `0x${string}`, logIndex: number): Promise<string> {
    try {
      // Create addNativeGas transaction data
      const refundAddress = this.walletClient.account.address;
      const transactionData = encodeFunctionData({
        abi: axelarGasService,
        functionName: 'addNativeGas',
        args: [swapHash, logIndex, refundAddress],
      });
      const gmlrValueRaw = multiplyByPowerOfTen(new Big(glmrUnits), 18); // Convert to raw GLMR units
      const { maxFeePerGas, maxPriorityFeePerGas } = await this.publicClient.estimateFeesPerGas();
      const gasPaymentHash = await this.walletClient.sendTransaction({
        to: AXL_GAS_SERVICE_MOONBEAM as `0x${string}`,
        value: BigInt(gmlrValueRaw.toFixed(0, 0)),
        data: transactionData,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      logger.info(`SquidRouterPayPhaseHandler: Fund transaction sent with hash: ${gasPaymentHash}`);
      return gasPaymentHash;
    } catch (error) {
      logger.error('SquidRouterPayPhaseHandler: Error funding gas to Axelar gas service: ', error);
      throw new Error('SquidRouterPayPhaseHandler: Failed to send transaction');
    }
  }

  private async getStatusAxelarScan(swapHash: string): Promise<AxelarScanStatusResponse> {
    try {
      // POST call, https://api.axelarscan.io/gmp/searchGMP
      const response = await fetch(`https://api.axelarscan.io/gmp/searchGMP`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          txHash: swapHash,
        }),
      });

      if (!response.ok) {
        throw new Error(`Error fetching status from axelar scan API: ${response.statusText}`);
      }
      const responseData = await response.json();
      return (responseData as any).data[0] as AxelarScanStatusResponse;
    } catch (error) {
      if ((error as any).response) {
        console.error('API error:', (error as any).response);
      }
      throw error;
    }
  }

  private async fetchFees(toChain: string): Promise<GpmFeeResult | null> {
    try {
      const response = await fetch('https://api.gmp.axelarscan.io/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'getFees', destinationChain: toChain, sourceChain: 'moonbeam' }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: GpmFeeResult = (await response.json()) as GpmFeeResult;
      return data;
    } catch (error) {
      return null;
    }
  }
}

export default new SquidRouterPayPhaseHandler();
