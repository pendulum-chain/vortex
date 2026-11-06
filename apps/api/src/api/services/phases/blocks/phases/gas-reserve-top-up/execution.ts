import { EvmClientManager, Networks, type RampPhase } from "@vortexfi/shared";
import logger from "../../../../../../config/logger";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import type RampState from "../../../../../../models/rampState.model";
import { PhaseError } from "../../../../../errors/phase-error";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { getEvmFundingAccount, runSerializedEvmFundingOperation, sendEvmFundingTransaction } from "../../core/evm-funding";
import { FinancialOperationRejectedError } from "../../core/financial-operation";
import { getBlockMetadata } from "../../core/metadata";
import { GasReserveTopUpContext } from "./simulation";

interface Receipt {
  status: "success" | "reverted";
}

export interface GasReserveTopUpDependencies {
  getNativeBalance(address: `0x${string}`): Promise<bigint>;
  getReceipt(hash: `0x${string}`): Promise<Receipt | null>;
  send(transaction: { to: `0x${string}`; value: bigint }): Promise<`0x${string}`>;
  waitForReceipt(hash: `0x${string}`): Promise<Receipt>;
}

function defaultDependencies(): GasReserveTopUpDependencies {
  const client = EvmClientManager.getInstance().getClient(Networks.Robinhood);
  return {
    getNativeBalance: address => client.getBalance({ address }),
    async getReceipt(hash) {
      try {
        return await client.getTransactionReceipt({ hash });
      } catch {
        return null;
      }
    },
    send: transaction => sendEvmFundingTransaction(Networks.Robinhood, transaction),
    waitForReceipt: hash => client.waitForTransactionReceipt({ hash })
  };
}

/** Sends the buyer the ETH the quote charged for. The tokens are already delivered, so nothing here fails the ramp. */
export class GasReserveTopUpExecutor extends BasePhaseHandler {
  constructor(private readonly injectedDependencies?: GasReserveTopUpDependencies) {
    super();
  }

  public getPhaseName(): RampPhase {
    return "gasReserveTopUp";
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    try {
      const quote = await QuoteTicket.findByPk(state.quoteId);
      if (!quote) throw new Error("the quote is missing");
      const { amountRaw } = getBlockMetadata(quote.metadata, GasReserveTopUpContext);
      const amount = BigInt(amountRaw);
      if (amount === 0n) return state;

      const destination = state.state.destinationAddress as `0x${string}` | undefined;
      if (!destination) throw new Error("the destination address is missing");
      const funding = getEvmFundingAccount(Networks.Robinhood).address;
      const dependencies = this.injectedDependencies ?? defaultDependencies();

      const settle = (hash: `0x${string}`, receipt: Receipt | null): { hash: `0x${string}` } | null => {
        if (!receipt) return null;
        if (receipt.status !== "success") throw new FinancialOperationRejectedError(`Gas reserve transfer ${hash} reverted`);
        return { hash };
      };
      await runSerializedEvmFundingOperation(
        Networks.Robinhood,
        () =>
          this.runFinancialOperation(state, {
            attemptClass: "gas-reserve-top-up",
            beforePerform: async () => {
              const available = await dependencies.getNativeBalance(funding);
              if (available >= amount) return;
              logger.error("EVM_FUNDING_TOKEN_BALANCE_LOW", {
                availableRaw: available.toString(),
                network: Networks.Robinhood,
                phase: this.getPhaseName(),
                rampId: state.id,
                requiredRaw: amountRaw,
                token: "ETH"
              });
              throw this.createRecoverableError(`Gas reserve: funding wallet holds ${available}, below ${amountRaw} wei`);
            },
            externalId: result => result.hash,
            perform: async () => {
              const hash = await dependencies.send({ to: destination, value: amount });
              await this.updateTxHash(state, hash);
              const result = settle(hash, await dependencies.waitForReceipt(hash));
              if (!result) throw new Error(`Gas reserve transfer ${hash} has no receipt`);
              return result;
            },
            provider: Networks.Robinhood,
            reconcile: async () => {
              const hash = this.getTxHash(state);
              return hash ? settle(hash, await dependencies.getReceipt(hash)) : null;
            },
            request: { amountRaw, destination, network: Networks.Robinhood, source: funding },
            settleAfterAbort: true,
            signal
          }),
        signal
      );
      return state;
    } catch (error) {
      if (error instanceof PhaseError) throw error;
      throw this.createRecoverableError(`Gas reserve: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getTxHash(state: RampState): `0x${string}` | undefined {
    const blockState = state.state.blockState?.[GasReserveTopUpContext.key] as { txHash?: `0x${string}` } | undefined;
    return blockState?.txHash;
  }

  private async updateTxHash(state: RampState, txHash: `0x${string}`): Promise<void> {
    await state.update({
      state: {
        ...state.state,
        blockState: { ...state.state.blockState, [GasReserveTopUpContext.key]: { txHash } }
      }
    });
  }
}
