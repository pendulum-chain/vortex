import { EvmClientManager, EvmNetworks, Networks, RampPhase } from "@vortexfi/shared";
import { erc20Abi } from "viem";
import logger from "../../../../config/logger";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

const EVM_BALANCE_CHECK_TIMEOUT_MS = 3 * 60 * 1000;
const BALANCE_POLLING_INTERVAL_MS = 5000;

const morphoVaultAbi = [
  {
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" }
    ],
    name: "deposit",
    outputs: [{ name: "shares", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

const MORPHO_NETWORK: EvmNetworks = Networks.Ethereum;

async function pollForShareBalance(
  evmClientManager: EvmClientManager,
  network: EvmNetworks,
  vaultAddress: `0x${string}`,
  ownerAddress: `0x${string}`
): Promise<bigint> {
  const client = evmClientManager.getClient(network);
  const deadline = Date.now() + EVM_BALANCE_CHECK_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const balance = await client.readContract({
      abi: morphoVaultAbi,
      address: vaultAddress,
      args: [ownerAddress],
      functionName: "balanceOf"
    });

    if (balance > 0n) {
      return balance;
    }

    await new Promise(resolve => setTimeout(resolve, BALANCE_POLLING_INTERVAL_MS));
  }

  throw new Error(`MorphoDepositHandler: Timed out waiting for share tokens on ${ownerAddress} at vault ${vaultAddress}`);
}

export class MorphoDepositHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "morphoDeposit";
  }

  public getMaxRetries(): number {
    return 5;
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const meta = state.state as StateMetadata;
    const evmClientManager = EvmClientManager.getInstance();

    if (!meta.morphoVaultAddress) {
      throw new Error("MorphoDepositHandler: Missing morphoVaultAddress in state metadata");
    }
    if (!meta.morphoDepositAssetAddress) {
      throw new Error("MorphoDepositHandler: Missing morphoDepositAssetAddress in state metadata");
    }
    if (!meta.evmEphemeralAddress) {
      throw new Error("MorphoDepositHandler: Missing evmEphemeralAddress in state metadata");
    }

    const vaultAddress = meta.morphoVaultAddress as `0x${string}`;
    const depositAssetAddress = meta.morphoDepositAssetAddress as `0x${string}`;
    const ephemeralAddress = meta.evmEphemeralAddress as `0x${string}`;
    const destinationAddress = meta.destinationAddress as `0x${string}`;

    const { approveTxData, depositTxData } = this.getMorphoPresignedTxs(state);

    // Step 1: Approve vault to spend deposit asset
    state = await this.executeApprove(
      state,
      evmClientManager,
      vaultAddress,
      depositAssetAddress,
      ephemeralAddress,
      approveTxData
    );

    // Step 2: Deposit into vault, verify share tokens minted to destination
    return this.executeDeposit(state, evmClientManager, vaultAddress, destinationAddress, depositTxData);
  }

  private getMorphoPresignedTxs(state: RampState): { approveTxData: string; depositTxData: string } {
    const approveTx = state.presignedTxs?.find(tx => tx.phase === "morphoApprove");
    const depositTx = state.presignedTxs?.find(tx => tx.phase === "morphoDeposit");
    if (!approveTx || !depositTx) {
      throw new Error(`MorphoDepositHandler: Missing presigned txs (approve: ${!!approveTx}, deposit: ${!!depositTx})`);
    }
    return { approveTxData: approveTx.txData as string, depositTxData: depositTx.txData as string };
  }

  private async executeApprove(
    state: RampState,
    evmClientManager: EvmClientManager,
    vaultAddress: `0x${string}`,
    depositAssetAddress: `0x${string}`,
    ephemeralAddress: `0x${string}`,
    approveTxData: string
  ): Promise<RampState> {
    const meta = state.state as StateMetadata;
    const requiredAmount = BigInt(meta.morphoDepositAmountRaw || "0");

    const allowance = await this.readAllowance(evmClientManager, depositAssetAddress, ephemeralAddress, vaultAddress);
    if (allowance >= requiredAmount) {
      logger.info(`MorphoDepositHandler: Allowance ${allowance} >= ${requiredAmount}, skipping approve`);
      return state;
    }

    const txHash = (await evmClientManager.sendRawTransactionWithRetry(
      MORPHO_NETWORK,
      approveTxData as `0x${string}`
    )) as `0x${string}`;

    logger.info(`MorphoDepositHandler: Approval tx broadcast: ${txHash}`);

    const receipt = await evmClientManager.getClient(MORPHO_NETWORK).waitForTransactionReceipt({ hash: txHash });
    if (!receipt || receipt.status !== "success") {
      throw new Error(`MorphoDepositHandler: Approval transaction ${txHash} failed on chain`);
    }

    await this.verifyAllowance(evmClientManager, depositAssetAddress, ephemeralAddress, vaultAddress, meta);

    return state;
  }

  private async readAllowance(
    evmClientManager: EvmClientManager,
    tokenAddress: `0x${string}`,
    ownerAddress: `0x${string}`,
    spenderAddress: `0x${string}`
  ): Promise<bigint> {
    const client = evmClientManager.getClient(MORPHO_NETWORK);
    return client.readContract({
      abi: erc20Abi,
      address: tokenAddress,
      args: [ownerAddress, spenderAddress],
      functionName: "allowance"
    });
  }

  private async verifyAllowance(
    evmClientManager: EvmClientManager,
    tokenAddress: `0x${string}`,
    ownerAddress: `0x${string}`,
    spenderAddress: `0x${string}`,
    meta: StateMetadata
  ): Promise<void> {
    const client = evmClientManager.getClient(MORPHO_NETWORK);
    const requiredAmount = BigInt(meta.morphoDepositAmountRaw || "0");
    const deadline = Date.now() + EVM_BALANCE_CHECK_TIMEOUT_MS;
    let lastAllowance = 0n;

    while (Date.now() < deadline) {
      lastAllowance = await client.readContract({
        abi: erc20Abi,
        address: tokenAddress,
        args: [ownerAddress, spenderAddress],
        functionName: "allowance"
      });

      if (lastAllowance >= requiredAmount) {
        logger.info(`MorphoDepositHandler: Allowance verified: ${lastAllowance} >= ${requiredAmount}`);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, BALANCE_POLLING_INTERVAL_MS));
    }

    throw new Error(`MorphoDepositHandler: Insufficient allowance. Have ${lastAllowance}, need ${requiredAmount}`);
  }

  private async executeDeposit(
    state: RampState,
    evmClientManager: EvmClientManager,
    vaultAddress: `0x${string}`,
    shareReceiver: `0x${string}`,
    depositTxData: string
  ): Promise<RampState> {
    const meta = state.state as StateMetadata;

    // Recovery: if we already broadcast the deposit, just verify shares
    if (meta.morphoDepositTxHash) {
      logger.info(
        `MorphoDepositHandler: Deposit tx already broadcast (${meta.morphoDepositTxHash}), verifying shares on ${shareReceiver}`
      );
      const shares = await pollForShareBalance(evmClientManager, MORPHO_NETWORK, vaultAddress, shareReceiver);
      logger.info(`MorphoDepositHandler: Share balance verified: ${shares}`);
      return state;
    }

    const txHash = (await evmClientManager.sendRawTransactionWithRetry(
      MORPHO_NETWORK,
      depositTxData as `0x${string}`
    )) as `0x${string}`;

    logger.info(`MorphoDepositHandler: Deposit tx broadcast: ${txHash}`);

    await state.update({
      state: { ...state.state, morphoDepositTxHash: txHash }
    });

    const receipt = await evmClientManager.getClient(MORPHO_NETWORK).waitForTransactionReceipt({ hash: txHash });
    if (!receipt || receipt.status !== "success") {
      throw new Error(`MorphoDepositHandler: Deposit transaction ${txHash} failed on chain`);
    }

    const shares = await pollForShareBalance(evmClientManager, MORPHO_NETWORK, vaultAddress, shareReceiver);
    logger.info(`MorphoDepositHandler: Deposit successful. Share balance on ${shareReceiver}: ${shares}`);

    return state;
  }
}

export default new MorphoDepositHandler();
