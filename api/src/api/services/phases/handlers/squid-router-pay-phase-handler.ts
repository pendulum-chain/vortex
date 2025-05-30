import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';
import logger from '../../../../config/logger';
import { RampPhase } from 'shared';
import { createPublicClient, encodeFunctionData, http } from 'viem';
import { moonbeam } from 'viem/chains';
import { getStatus } from '../../transactions/squidrouter/route';
import { axelarGasService } from '../../../../contracts/AxelarGasService'
import { privateKeyToAccount } from 'viem/accounts';
import { MOONBEAM_FUNDING_PRIVATE_KEY } from '../../../../constants/constants';
import { createMoonbeamClientsAndConfig } from '../../moonbeam/createServices';

interface AxelarScanStatusResponse {
    is_insufficient_fee: boolean;
    status: string; // executed (for complete).
    base_fee: number; // in units of the native token.
    express_execute_gas_multiplier: number; // ??
    call: {
      _logIndex: number; // log index of the initial swap transaction. Used to add gas.
    }
}

const AXELAR_POLLING_INTERVAL_MS = 10000; // 10 seconds
const AXL_GAS_SERVICE_MOONBEAM = '0x2d5d7d31F671F86C782533cc367F14109a082712';
/**
 * Handler for the squidRouter pay phase. Checks the status of the Axelar bridge and pays on native GLMR fee if necessary.
 * Only used for the onramp flow. For the offramp, the UI can send the transactions to better confirm outputs.
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
      const bridgeCallHash = state.state.squidRouterBridgeHash;
      if (!bridgeCallHash) {
        throw new Error('SquidRouterPayPhaseHandler: Missing bridge hash in state for squidRouterPay phase. State corrupted.');
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
      const _ = await getStatus(swapHash); // Found to be unreliable. Returned "not found" for valid transactions.
      
      let isExecuted = false;
      let payTxHash: string | undefined = state.state.squidrouterPayTxHash; // in case of recovery, we may have already paid.
      while (!isExecuted) {
        const axelarScanStatus = await this.getStatusAxelarScan(swapHash);

        if (axelarScanStatus.status.toLowerCase() === 'executed') {
          isExecuted = true;
          logger.info(`SquidRouterPayPhaseHandler: Transaction ${swapHash} successfully executed on Axelar.`);
          break;
        }

        if (axelarScanStatus.is_insufficient_fee && !payTxHash) {
          const glmrToFund = axelarScanStatus.base_fee.toString();
          payTxHash = await this.executeFundTransaction(glmrToFund, swapHash as `0x${string}`, axelarScanStatus.call._logIndex); 

          await state.update({
            state: {
              ...state.state,
              squidrouterPayTxHash: payTxHash,
            },
          });
        }

        await new Promise(resolve => setTimeout(resolve, AXELAR_POLLING_INTERVAL_MS));
  
      }
    } catch (error) {
      throw new Error(`SquidRouterPayPhaseHandler: Error waiting for transaction confirmation: ${error}`);
    }
  }

  /**
   * Execute a call to the Axelar gas service and fund the bridge process.
   * @param glmrUnits The amount of GLMR to fund the transaction with.
   * @returns ...
   */
  private async executeFundTransaction(glmrUnits: string, swapHash: `0x${string}`, logIndex: number): Promise<string> {
    try {
      
      // Create addNativeGas transaction data
      const refundAddress = this.walletClient.account.address;
      const approveTransactionData = encodeFunctionData({
        abi: axelarGasService,
        functionName: 'addNativeGas',
        args: [glmrUnits, swapHash, logIndex, refundAddress],
      });
      
      const { maxFeePerGas, maxPriorityFeePerGas } = await this.publicClient.estimateFeesPerGas();
       const gasPaymentHash = await this.walletClient.sendTransaction({
        to: AXL_GAS_SERVICE_MOONBEAM as `0x${string}`,
        value: 0n,
        data: approveTransactionData,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });

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
        method: "POST",
        body: JSON.stringify({ 
          txHash: swapHash,
        })
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

}



export default new SquidRouterPayPhaseHandler();
