import {
  ERC20_EURC_BASE,
  EvmClientManager,
  getEvmTokenBalance,
  PermitSignature,
  RampDirection,
  RampPhase
} from "@vortexfi/shared";
import Big from "big.js";
import { encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import logger from "../../../../config/logger";
import { MOONBEAM_EXECUTOR_PRIVATE_KEY } from "../../../../constants/constants";
import { permitAbi } from "../../../../contracts/PermitAbi";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { MYKOBO_BASE_NETWORK } from "../../mykobo";
import { BasePhaseHandler } from "../base-phase-handler";

export class MykoboOnrampTransferPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "mykoboOnrampTransfer";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    logger.info(`Executing mykoboOnrampTransfer phase for ramp ${state.id}`);

    if (state.type === RampDirection.SELL) {
      logger.info("mykoboOnrampTransfer is not supported for off-ramp");
      return state;
    }

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    if (!quote.metadata.mykoboMint?.outputAmountRaw) {
      throw new Error("MykoboOnrampTransfer: Missing mykoboMint metadata.");
    }

    const { evmEphemeralAddress, mykoboOnrampPermit, mykoboWalletAddress } = state.state;
    if (!evmEphemeralAddress) {
      throw new Error("MykoboOnrampTransfer: Base ephemeral address not defined in the state. This is a bug.");
    }
    if (!mykoboOnrampPermit) {
      throw new Error("MykoboOnrampTransfer: Missing Mykobo permit in state metadata. State corrupted.");
    }
    if (!mykoboWalletAddress) {
      throw new Error("MykoboOnrampTransfer: Missing Mykobo wallet address in state metadata. State corrupted.");
    }

    const mintedAmountRaw = quote.metadata.mykoboMint.outputAmountRaw;

    if (await this.tokensAlreadyOnEphemeral(evmEphemeralAddress, mintedAmountRaw)) {
      logger.info(`Tokens already on Base ephemeral ${evmEphemeralAddress}. Skipping self-transfer.`);
      return this.transitionToNextPhase(state, "squidRouterSwap");
    }

    try {
      await this.submitPermitIfNeeded(state, mykoboWalletAddress, evmEphemeralAddress, mintedAmountRaw, mykoboOnrampPermit);
      await this.submitPresignedTransferFrom(state);

      // Settle delay: give the EVM client cache 30 s to converge on the new ephemeral balance
      // before squidRouterSwap reads it.
      await new Promise(resolve => setTimeout(resolve, 30000));

      return this.transitionToNextPhase(state, "squidRouterSwap");
    } catch (error: unknown) {
      logger.error(`Error in mykoboOnrampTransfer phase for ramp ${state.id}:`, error);
      throw this.createRecoverableError(`MykoboOnrampTransferHandler: ${error}`);
    }
  }

  private async tokensAlreadyOnEphemeral(evmEphemeralAddress: string, mintedAmountRaw: string): Promise<boolean> {
    try {
      const balance = await getEvmTokenBalance({
        chain: MYKOBO_BASE_NETWORK,
        ownerAddress: evmEphemeralAddress as `0x${string}`,
        tokenAddress: ERC20_EURC_BASE
      });
      return balance.gte(Big(mintedAmountRaw));
    } catch (error) {
      throw this.createRecoverableError(`MykoboOnrampTransferHandler: Error checking Base balance: ${error}`);
    }
  }

  private async submitPermitIfNeeded(
    state: RampState,
    mykoboWalletAddress: string,
    evmEphemeralAddress: string,
    mintedAmountRaw: string,
    permit: PermitSignature
  ): Promise<void> {
    if (state.state.mykoboPermitTxHash) {
      logger.info(`Mykobo permit already sent: ${state.state.mykoboPermitTxHash}. Skipping.`);
      return;
    }

    const account = privateKeyToAccount(MOONBEAM_EXECUTOR_PRIVATE_KEY as `0x${string}`);
    const permitData = encodeFunctionData({
      abi: permitAbi,
      args: [mykoboWalletAddress, evmEphemeralAddress, BigInt(mintedAmountRaw), permit.deadline, permit.v, permit.r, permit.s],
      functionName: "permit"
    });

    const permitHash = await EvmClientManager.getInstance().sendTransactionWithBlindRetry(MYKOBO_BASE_NETWORK, account, {
      data: permitData,
      to: ERC20_EURC_BASE
    });
    logger.info(`Mykobo permit transaction executed with hash: ${permitHash}`);

    await this.waitForTransactionConfirmation(permitHash);
    logger.info(`Mykobo permit transaction confirmed: ${permitHash}`);

    state.state.mykoboPermitTxHash = permitHash;
    await state.update({ state: state.state });
  }

  private async submitPresignedTransferFrom(state: RampState): Promise<void> {
    const transferTransaction = this.getPresignedTransaction(state, "mykoboOnrampTransfer");
    if (!transferTransaction) {
      throw new Error("Missing presigned transaction for mykoboOnrampTransfer phase. State corrupted.");
    }

    const transferHash = await this.executeTransaction(transferTransaction.txData as string);
    logger.info(`Mykobo transferFrom executed with hash: ${transferHash}`);

    await this.waitForTransactionConfirmation(transferHash);
    logger.info(`Mykobo transferFrom confirmed: ${transferHash}`);
  }

  private async executeTransaction(txData: string): Promise<string> {
    try {
      return await EvmClientManager.getInstance().sendRawTransactionWithRetry(MYKOBO_BASE_NETWORK, txData as `0x${string}`);
    } catch (error) {
      logger.error("Error sending raw transaction", error);
      throw new Error("Failed to send transaction");
    }
  }

  private async waitForTransactionConfirmation(txHash: string): Promise<void> {
    try {
      const receipt = await EvmClientManager.getInstance()
        .getClient(MYKOBO_BASE_NETWORK)
        .waitForTransactionReceipt({ hash: txHash as `0x${string}` });
      if (!receipt || receipt.status !== "success") {
        throw new Error(`mykoboOnrampTransferHandler: Transaction ${txHash} failed or was not found`);
      }
    } catch (error) {
      throw new Error(`mykoboOnrampTransferHandler: Error waiting for transaction confirmation: ${error}`);
    }
  }
}

export default new MykoboOnrampTransferPhaseHandler();
