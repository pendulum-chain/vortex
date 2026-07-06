import {
  checkEvmBalanceForToken,
  EvmClientManager,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  evmTokenConfig,
  multiplyByPowerOfTen,
  Networks,
  RampPhase,
  waitUntilTrueWithTimeout
} from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../../../config/logger";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import RampState from "../../../../../models/rampState.model";
import { PhaseError } from "../../../../errors/phase-error";
import { BasePhaseHandler } from "../../../phases/base-phase-handler";
import { evmIO } from "../core/io";
import type { ChainBrand, Phase, PhaseCtx, PhaseIO, TokenBrand } from "../core/types";

const SIMPLIFIED_TOKEN_DECIMALS = 6;

const FEE_BALANCE_POLL_INTERVAL_MS = 5_000;
const FEE_BALANCE_POLL_TIMEOUT_MS = 60_000;

// EVM slice of the production DistributeFeesHandler: verifies the ephemeral holds enough USDC on
// Base to cover the USD fees, then broadcasts the presigned fee-distribution transaction. The
// substrate (Pendulum/Subscan) branch is not ported.
class DistributeFeesExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "distributeFees";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const quote = await QuoteTicket.findOne({ where: { id: state.quoteId } });
    if (!quote) {
      throw this.createUnrecoverableError(`Quote ticket not found for ID: ${state.quoteId}`);
    }

    const existingHash = state.state.distributeFeeHash || null;
    if (existingHash) {
      logger.info(`Found existing distribute fee hash for ramp ${state.id}: ${existingHash}`);

      const isSuccessful = await this.isEvmTransactionSuccessful(existingHash, Networks.Base).catch((_: unknown) => {
        throw this.createRecoverableError("Failed to check EVM transaction status from existing hash.");
      });

      if (isSuccessful) {
        logger.info(`Existing distribute fee EVM transaction was successful for ramp ${state.id}`);
        return state;
      }
      logger.info("Existing distribute fee EVM transaction was not successful, will retry");
    }

    try {
      const distributeFeeTransaction = this.getPresignedTransaction(state, "distributeFees");
      if (distributeFeeTransaction === undefined) {
        logger.info("No fee distribution transaction data found. Skipping fee distribution.");
        return state;
      }

      // The funding token (USDC) may not yet be on the ephemeral when we reach this phase.
      // Poll for it before submitting; if it never arrives within the timeout, throw a
      // recoverable error so we retry the phase.
      await this.ensureEvmFeeTokenBalance(quote, distributeFeeTransaction.signer);

      logger.info(`Submitting EVM fee distribution transaction for ramp ${state.id}...`);
      const txData = distributeFeeTransaction.txData;
      if (typeof txData !== "string" || !txData.startsWith("0x")) {
        throw new Error("DistributeFeesExecutor: Invalid presigned EVM transaction data");
      }
      const evmClientManager = EvmClientManager.getInstance();
      const network = distributeFeeTransaction.network as EvmNetworks;
      const actualTxHash = await evmClientManager.sendRawTransactionWithRetry(network, txData as `0x${string}`);

      logger.info(`Transaction broadcast with hash ${actualTxHash}. Persisting hash...`);
      await state.update({
        state: {
          ...state.state,
          distributeFeeHash: actualTxHash
        }
      });

      await this.waitForEvmTransactionSuccess(actualTxHash, network);

      logger.info(`Successfully verified fee distribution transaction for ramp ${state.id}: ${actualTxHash}`);
      return state;
    } catch (e: unknown) {
      logger.error(`Error distributing fees for ramp ${state.id}:`, e);

      if (e instanceof PhaseError) {
        throw e;
      }

      const error = e instanceof Error ? e : new Error(String(e));
      throw this.createRecoverableError(`Failed to distribute fees: ${error.message || "Unknown error"}`);
    }
  }

  private computeRequiredFeeRaw(quote: QuoteTicket, decimals: number): Big | null {
    const usdFeeStructure = quote.metadata.fees?.usd;
    if (!usdFeeStructure) {
      return null;
    }

    const totalUsd = new Big(usdFeeStructure.network).plus(usdFeeStructure.vortex).plus(usdFeeStructure.partnerMarkup);
    if (totalUsd.lte(0)) {
      return null;
    }

    return multiplyByPowerOfTen(totalUsd, decimals);
  }

  private async ensureEvmFeeTokenBalance(quote: QuoteTicket, signerAddress: string): Promise<void> {
    const baseUsdcConfig = evmTokenConfig[Networks.Base][EvmToken.USDC] as EvmTokenDetails | undefined;
    if (!baseUsdcConfig) {
      throw this.createUnrecoverableError("Base USDC configuration not found; cannot verify fee balance.");
    }

    const requiredRaw = this.computeRequiredFeeRaw(quote, baseUsdcConfig.decimals);
    if (!requiredRaw) {
      logger.info("No positive USD fees configured; skipping fee balance precondition check.");
      return;
    }

    logger.info(
      `Checking EVM fee balance: signer=${signerAddress} requires >= ${requiredRaw.toFixed(0)} USDC raw on Base before submitting fee distribution.`
    );

    try {
      const balance = await checkEvmBalanceForToken({
        amountDesiredRaw: requiredRaw.toFixed(0),
        chain: Networks.Base as EvmNetworks,
        intervalMs: FEE_BALANCE_POLL_INTERVAL_MS,
        ownerAddress: signerAddress,
        timeoutMs: FEE_BALANCE_POLL_TIMEOUT_MS,
        tokenDetails: baseUsdcConfig
      });
      logger.info(`EVM fee balance precondition met: balance=${balance.toFixed(0)} >= required=${requiredRaw.toFixed(0)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw this.createRecoverableError(
        `Fee distribution precondition failed: USDC balance not available on ${signerAddress} within ${FEE_BALANCE_POLL_TIMEOUT_MS}ms. ${message}`
      );
    }
  }

  private async isEvmTransactionSuccessful(txHash: string, network: EvmNetworks): Promise<boolean> {
    try {
      const publicClient = EvmClientManager.getInstance().getClient(network);
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
      return receipt?.status === "success";
    } catch (error) {
      logger.debug(`Error checking EVM transaction receipt: ${error}`);
      return false;
    }
  }

  private async waitForEvmTransactionSuccess(txHash: string, network: EvmNetworks): Promise<void> {
    await waitUntilTrueWithTimeout(
      () => this.isEvmTransactionSuccessful(txHash, network),
      2000, // check every 2 seconds
      180000 // timeout after 3 minutes
    );
  }
}

export function DistributeFees<Token extends TokenBrand, Chain extends ChainBrand>(): Phase<
  PhaseIO<Token, Chain>,
  PhaseIO<Token, Chain>
> {
  return {
    executors: [new DistributeFeesExecutor()],
    name: "DistributeFees",
    phases: ["distributeFees"],
    async simulate(input: PhaseIO<Token, Chain>, ctx: PhaseCtx): Promise<PhaseIO<Token, Chain>> {
      if (!ctx.fees?.usd) {
        ctx.addNote("DistributeFees: no fees in ctx, skipping");
        return input;
      }
      const usdFees = ctx.fees.usd;
      const totalFeesUsd = new Big(usdFees.network).plus(usdFees.vortex).plus(usdFees.partnerMarkup);
      const newAmount = new Big(input.amount).minus(totalFeesUsd);
      if (newAmount.lt(0)) {
        ctx.addNote(`DistributeFees: fees ${totalFeesUsd.toFixed()} USD exceed amount ${input.amount.toFixed()}, setting to 0`);
        return evmIO(input.token, input.chain, new Big(0), "0", input.meta) as PhaseIO<Token, Chain>;
      }
      const newAmountRaw = newAmount.times(new Big(10).pow(SIMPLIFIED_TOKEN_DECIMALS)).toFixed(0, 0);
      ctx.addNote(
        `DistributeFees: ${input.amount.toFixed()} ${input.token} -> ${newAmount.toFixed()} ${input.token} after ${totalFeesUsd.toFixed()} USD fees`
      );
      return evmIO(input.token, input.chain, newAmount, newAmountRaw, input.meta) as PhaseIO<Token, Chain>;
    }
  };
}
