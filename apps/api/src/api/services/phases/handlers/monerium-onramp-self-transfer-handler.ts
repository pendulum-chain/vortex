import {
  ERC20_EURE_POLYGON_TOKEN_NAME,
  ERC20_EURE_POLYGON_V2,
  EvmClientManager,
  getEvmTokenBalance,
  Networks,
  RampDirection,
  RampPhase
} from "@vortexfi/shared";
import Big from "big.js";
import { encodeFunctionData, PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import logger from "../../../../config/logger";
import { config } from "../../../../config/vars";
import erc20ABI from "../../../../contracts/ERC20";
import { permitAbi } from "../../../../contracts/PermitAbi";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { analyzeMoneriumPermitPreflight, MoneriumPermitDiagnostics } from "../../ramp/monerium-permit";
import { BasePhaseHandler } from "../base-phase-handler";

const permitNonceAbi = [
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "nonces",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

/**
 * Handler for the monerium self-transfer phase
 */
export class MoneriumOnrampSelfTransferHandler extends BasePhaseHandler {
  private polygonClient: PublicClient;
  private evmClientManager: EvmClientManager;

  constructor() {
    super();
    this.evmClientManager = EvmClientManager.getInstance();
    this.polygonClient = this.evmClientManager.getClient(Networks.Polygon);
  }

  /**
   * Get the phase name
   */
  public getPhaseName(): RampPhase {
    return "moneriumOnrampSelfTransfer";
  }

  /**
   * Execute the phase
   * @param state The current ramp state
   * @returns The updated ramp state
   */
  protected async executePhase(state: RampState): Promise<RampState> {
    logger.info(`Executing moneriumOnrampSelfTransfer phase for ramp ${state.id}`);

    if (state.type === RampDirection.SELL) {
      logger.info("MoneriumOnrampSelfTransfer phase is not supported for off-ramp");
      return state;
    }

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    if (!quote.metadata.moneriumMint?.outputAmountRaw) {
      throw new Error("MoneriumOnrampSelfTransfer: Missing moneriumMint metadata.");
    }

    const { evmEphemeralAddress, moneriumOnrampPermit, moneriumWalletAddress } = state.state;
    if (!evmEphemeralAddress) {
      throw new Error("MoneriumOnrampSelfTransfer: Polygon ephemeral address not defined in the state. This is a bug.");
    }
    if (!moneriumOnrampPermit) {
      throw new Error("MoneriumOnrampSelfTransfer: Missing Monerium permit in state metadata. State corrupted.");
    }
    if (!moneriumWalletAddress) {
      throw new Error("MoneriumOnrampSelfTransfer: Missing Monerium wallet address in state metadata. State corrupted.");
    }

    const mintedAmountRaw = quote.metadata.moneriumMint.outputAmountRaw;

    const didTokensArriveOnEvm = async () => {
      const balance = await getEvmTokenBalance({
        chain: Networks.Polygon,
        ownerAddress: evmEphemeralAddress as `0x${string}`,
        tokenAddress: ERC20_EURE_POLYGON_V2
      });
      return balance.gte(Big(mintedAmountRaw));
    };

    try {
      if (await didTokensArriveOnEvm()) {
        logger.info(`Tokens have arrived on Polygon ephemeral address: ${evmEphemeralAddress}. Skipping self-transfer.`);
        return this.transitionToNextPhase(state, "squidRouterSwap");
      }
    } catch (error) {
      // inability to check balance is not a critical error and should be temporal, we can proceed throw a recoverable.
      throw this.createRecoverableError(`MoneriumOnrampSelfTransferHandler: Error checking Polygon balance: ${error}`);
    }

    try {
      const account = privateKeyToAccount(config.secrets.moonbeamExecutorPrivateKey as `0x${string}`);
      let permitHash: string;

      if (state.state.permitTxHash) {
        logger.info(`Permit transaction already sent with hash: ${state.state.permitTxHash}. Skipping permit sending.`);
        permitHash = state.state.permitTxHash;
      } else {
        const owner = moneriumWalletAddress as `0x${string}`;
        const spender = evmEphemeralAddress as `0x${string}`;
        const permitExpectation = {
          expectedOwner: owner,
          expectedSpender: spender,
          expectedTokenAddress: ERC20_EURE_POLYGON_V2,
          expectedTokenName: ERC20_EURE_POLYGON_TOKEN_NAME,
          expectedValueRaw: mintedAmountRaw,
          network: Networks.Polygon
        };
        const permitDiagnostics = await this.getPermitDiagnostics(owner, spender);
        const signedPermitContext = moneriumOnrampPermit.context;
        logger.info(
          `[${state.id}] Monerium permit preflight: ${JSON.stringify({
            allowanceRaw: permitDiagnostics.allowanceRaw.toString(),
            balanceRaw: permitDiagnostics.balanceRaw.toString(),
            deadline: moneriumOnrampPermit.context?.deadline ?? moneriumOnrampPermit.deadline,
            deadlineIso: new Date(
              Number(moneriumOnrampPermit.context?.deadline ?? moneriumOnrampPermit.deadline) * 1000
            ).toISOString(),
            executor: account.address,
            expectedValueRaw: mintedAmountRaw,
            nonce: permitDiagnostics.nonce.toString(),
            owner,
            signedChainId: signedPermitContext?.chainId,
            signedNonce: signedPermitContext?.nonce,
            signedTokenAddress: signedPermitContext?.tokenAddress,
            signedTokenName: signedPermitContext?.tokenName,
            signedTokenVersion: signedPermitContext?.tokenVersion,
            signedValueRaw: signedPermitContext?.valueRaw,
            spender,
            tokenAddress: ERC20_EURE_POLYGON_V2,
            tokenName: permitDiagnostics.tokenName
          })}`
        );

        const permitPreflight = analyzeMoneriumPermitPreflight(moneriumOnrampPermit, permitExpectation, permitDiagnostics);
        if (!permitPreflight.shouldSendPermit) {
          logger.info(
            `[${state.id}] Existing Monerium allowance covers ${mintedAmountRaw}. Skipping permit transaction (${permitPreflight.reason}).`
          );
        } else if (permitDiagnostics.balanceRaw < BigInt(mintedAmountRaw)) {
          logger.warn(
            `[${state.id}] Monerium wallet balance ${permitDiagnostics.balanceRaw.toString()} is below expected transfer amount ${mintedAmountRaw}. Permit may still succeed, but transferFrom will wait for sufficient balance.`
          );
        }

        const permitArgs = [
          owner,
          spender,
          BigInt(mintedAmountRaw),
          moneriumOnrampPermit.deadline,
          moneriumOnrampPermit.v,
          moneriumOnrampPermit.r,
          moneriumOnrampPermit.s
        ] as const;

        if (!permitPreflight.shouldSendPermit) {
          permitHash = "";
        } else {
          await this.simulatePermit(state.id, account.address, permitArgs);

          const walletClient = this.evmClientManager.getWalletClient(Networks.Polygon, account);
          permitHash = await walletClient.sendTransaction({
            data: encodeFunctionData({
              abi: permitAbi,
              args: permitArgs,
              functionName: "permit"
            }),
            to: ERC20_EURE_POLYGON_V2
          });
        }
      }

      if (permitHash) {
        logger.info(`Permit transaction executed with hash: ${permitHash}`);

        await this.waitForTransactionConfirmation(permitHash);
        logger.info(`Permit transaction confirmed: ${permitHash}`);

        state.state.permitTxHash = permitHash;
        await state.update({ state: state.state });
      }

      const transferTransaction = this.getPresignedTransaction(state, "moneriumOnrampSelfTransfer");

      if (!transferTransaction) {
        throw new Error("Missing presigned transactions for moneriumOnrampSelfTransfer phase. State corrupted.");
      }

      // Execute the transfer transaction
      const transferHash = await this.executeTransaction(transferTransaction.txData as string);
      logger.info(`Transfer transaction executed with hash: ${transferHash}`);

      await this.waitForTransactionConfirmation(transferHash);
      logger.info(`TransferFrom transaction confirmed: ${transferHash}`);

      // Wait for another 30 seconds to give time for the balance to update (in case other RPC nodes are lagging)
      logger.info("Waiting 30 seconds to ensure balance is updated...");
      await new Promise(resolve => setTimeout(resolve, 30000));

      // Transition to the next phase
      return this.transitionToNextPhase(state, "squidRouterSwap");
    } catch (error: unknown) {
      logger.error(`Error in self-transfer phase for ramp ${state.id}:`, error);
      throw this.createRecoverableError(
        `MoneriumOnrampSelfTransferHandler: Error while sending self-transfer transaction: ${error}`
      );
    }
  }

  private async getPermitDiagnostics(owner: `0x${string}`, spender: `0x${string}`): Promise<MoneriumPermitDiagnostics> {
    const [allowanceRaw, balanceRaw, nonce, tokenName] = await Promise.all([
      this.evmClientManager.readContractWithRetry<bigint>(Networks.Polygon, {
        abi: erc20ABI,
        address: ERC20_EURE_POLYGON_V2,
        args: [owner, spender],
        functionName: "allowance"
      }),
      this.evmClientManager.readContractWithRetry<bigint>(Networks.Polygon, {
        abi: erc20ABI,
        address: ERC20_EURE_POLYGON_V2,
        args: [owner],
        functionName: "balanceOf"
      }),
      this.evmClientManager.readContractWithRetry<bigint>(Networks.Polygon, {
        abi: permitNonceAbi,
        address: ERC20_EURE_POLYGON_V2,
        args: [owner],
        functionName: "nonces"
      }),
      this.evmClientManager.readContractWithRetry<string>(Networks.Polygon, {
        abi: erc20ABI,
        address: ERC20_EURE_POLYGON_V2,
        functionName: "name"
      })
    ]);

    return { allowanceRaw, balanceRaw, nonce, tokenName };
  }

  private async simulatePermit(
    rampId: string,
    executorAddress: `0x${string}`,
    permitArgs: readonly [`0x${string}`, `0x${string}`, bigint, number, number, `0x${string}`, `0x${string}`]
  ): Promise<void> {
    try {
      await this.polygonClient.simulateContract({
        abi: permitAbi,
        account: executorAddress,
        address: ERC20_EURE_POLYGON_V2,
        args: permitArgs,
        functionName: "permit"
      });
    } catch (error) {
      throw new Error(
        `[${rampId}] Monerium permit simulation failed before broadcast: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  /**
   * Execute a transaction
   * @param txData The transaction data
   * @returns The transaction hash
   */
  private async executeTransaction(txData: string): Promise<string> {
    try {
      const evmClientManager = EvmClientManager.getInstance();
      const txHash = await evmClientManager.sendRawTransactionWithRetry(Networks.Polygon, txData as `0x${string}`);
      return txHash;
    } catch (error) {
      logger.error("Error sending raw transaction", error);
      throw new Error("Failed to send transaction");
    }
  }

  /**
   * Wait for a transaction to be confirmed
   * @param txHash The transaction hash
   * @param chainId The chain ID
   */
  private async waitForTransactionConfirmation(txHash: string): Promise<void> {
    try {
      const receipt = await this.polygonClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`
      });
      if (!receipt || receipt.status !== "success") {
        throw new Error(`moneriumOnrampSelfTransferHandler: Transaction ${txHash} failed or was not found`);
      }
    } catch (error) {
      throw new Error(`moneriumOnrampSelfTransferHandler: Error waiting for transaction confirmation: ${error}`);
    }
  }
}

export default new MoneriumOnrampSelfTransferHandler();
