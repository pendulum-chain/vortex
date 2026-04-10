import { CleanupPhase, EvmClientManager, EvmNetworks, Networks, RampDirection } from "@vortexfi/shared";
import { Transaction as EvmTransaction } from "ethers";
import { erc20Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../../../../config";
import logger from "../../../../config/logger";
import { MOONBEAM_FUNDING_PRIVATE_KEY } from "../../../../config/vars";
import RampState from "../../../../models/rampState.model";
import { BasePostProcessHandler } from "./base-post-process-handler";

export class PolygonPostProcessHandler extends BasePostProcessHandler {
  public getCleanupName(): CleanupPhase {
    return "polygonCleanup";
  }

  public shouldProcess(state: RampState): boolean {
    if (state.currentPhase !== "complete") {
      return false;
    }

    if (state.type !== RampDirection.BUY) {
      return false;
    }

    const presignedTx = this.getPresignedTransaction(state, "polygonCleanup");
    return presignedTx !== undefined;
  }

  public async process(state: RampState): Promise<[boolean, Error | null]> {
    const ephemeralAddress = state.state.evmEphemeralAddress;
    if (!ephemeralAddress) {
      return [false, this.createErrorObject("No EVM ephemeral address found in state")];
    }

    const polygonNetwork: EvmNetworks = config.sandboxEnabled ? Networks.PolygonAmoy : Networks.Polygon;

    try {
      const presignedTx = this.getPresignedTransaction(state, "polygonCleanup");
      const signedApproveTx = presignedTx.txData as string;

      const parsedTx = EvmTransaction.from(signedApproveTx);
      const tokenAddress = parsedTx.to as `0x${string}`;
      if (!tokenAddress) {
        return [false, this.createErrorObject("Could not extract token address from presigned approve tx")];
      }

      const evmClientManager = EvmClientManager.getInstance();
      const publicClient = evmClientManager.getClient(polygonNetwork);

      const balance = await publicClient.readContract({
        abi: erc20Abi,
        address: tokenAddress,
        args: [ephemeralAddress as `0x${string}`],
        functionName: "balanceOf"
      });

      if (balance === 0n) {
        logger.info(`Polygon cleanup for ramp ${state.id}: ephemeral has zero balance, skipping transferFrom`);
        return [true, null];
      }

      const txHash = await evmClientManager.sendRawTransactionWithRetry(polygonNetwork, signedApproveTx as `0x${string}`);
      const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
      if (!approveReceipt || approveReceipt.status !== "success") {
        return [false, this.createErrorObject(`Approve tx ${txHash} failed`)];
      }

      const fundingAccount = privateKeyToAccount(MOONBEAM_FUNDING_PRIVATE_KEY as `0x${string}`);
      const walletClient = evmClientManager.getWalletClient(polygonNetwork, fundingAccount);

      const transferFromHash = await walletClient.writeContract({
        abi: erc20Abi,
        address: tokenAddress,
        args: [ephemeralAddress as `0x${string}`, fundingAccount.address, balance],
        functionName: "transferFrom"
      });

      const transferReceipt = await publicClient.waitForTransactionReceipt({ hash: transferFromHash });
      if (!transferReceipt || transferReceipt.status !== "success") {
        return [false, this.createErrorObject(`transferFrom tx ${transferFromHash} failed`)];
      }

      logger.info(`Successfully processed Polygon cleanup for ramp state ${state.id}, swept ${balance} tokens`);
      return [true, null];
    } catch (e) {
      return [false, this.createErrorObject(`Error in Polygon cleanup: ${e}`)];
    }
  }
}

export default new PolygonPostProcessHandler();
