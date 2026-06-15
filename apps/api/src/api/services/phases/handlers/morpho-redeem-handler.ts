import { EvmClientManager, EvmNetworks, Networks, RampPhase } from "@vortexfi/shared";
import { erc20Abi } from "viem";
import logger from "../../../../config/logger";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

const EVM_BALANCE_CHECK_TIMEOUT_MS = 3 * 60 * 1000;
const BALANCE_POLLING_INTERVAL_MS = 5000;

const vaultRedeemAbi = [
  {
    inputs: [
      { name: "shares", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" }
    ],
    name: "redeem",
    outputs: [{ name: "assets", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "shares", type: "uint256" }],
    name: "previewRedeem",
    outputs: [{ name: "assets", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

const ETHEREUM_NETWORK: EvmNetworks = Networks.Ethereum;

function resolveMorphoNetwork(meta: StateMetadata): EvmNetworks {
  return (meta.morphoNetwork as EvmNetworks | undefined) ?? ETHEREUM_NETWORK;
}

/**
 * Phase description:
 *  Broadcasts the presigned vault.redeem(shares, ephemeral, ephemeral) tx on Ethereum.
 *  Defends against bad output with three layers:
 *    1. Pre-flight: read previewRedeem(shares) before broadcast; abort if below minOutputRaw.
 *    2. Event parse: parse the Withdraw event from the receipt; assert event.assets >= minOutputRaw.
 *    3. Balance poll: as a final fallback, poll USDC.balanceOf(ephemeral) until >= minOutputRaw.
 */
export class MorphoRedeemHandler extends BasePhaseHandler {
  private evmClientManager: EvmClientManager;

  constructor() {
    super();
    this.evmClientManager = EvmClientManager.getInstance();
  }

  public getPhaseName(): RampPhase {
    return "morphoRedeem";
  }

  public getMaxRetries(): number {
    return 5;
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const meta = state.state as StateMetadata;

    if (!meta.morphoRedeemVaultAddress) {
      throw this.createUnrecoverableError("Missing morphoRedeemVaultAddress in state metadata");
    }
    if (!meta.morphoRedeemAssetAddress) {
      throw this.createUnrecoverableError("Missing morphoRedeemAssetAddress in state metadata");
    }
    if (!meta.evmEphemeralAddress) {
      throw this.createUnrecoverableError("Missing evmEphemeralAddress in state metadata");
    }
    if (!meta.morphoRedeemSharesAmountRaw) {
      throw this.createUnrecoverableError("Missing morphoRedeemSharesAmountRaw in state metadata");
    }

    const network = resolveMorphoNetwork(meta);
    const vaultAddress = meta.morphoRedeemVaultAddress as `0x${string}`;
    const assetAddress = meta.morphoRedeemAssetAddress as `0x${string}`;
    const ephemeralAddress = meta.evmEphemeralAddress as `0x${string}`;
    const sharesAmount = BigInt(meta.morphoRedeemSharesAmountRaw);
    const minOutputRaw = BigInt(meta.morphoRedeemMinOutputRaw || "0");

    // Recovery: if we already broadcast the redeem, verify the outcome.
    if (meta.morphoRedeemTxHash) {
      logger.info(`MorphoRedeemHandler: Redeem tx already broadcast (${meta.morphoRedeemTxHash}), verifying USDC balance`);
      await this.verifyUsdcBalance(network, assetAddress, ephemeralAddress, minOutputRaw);
      return state;
    }

    // Layer 1: pre-flight previewRedeem. If the on-chain rate has drifted past tolerance before
    // we even broadcast, abort without spending gas on a doomed redeem.
    const publicClient = this.evmClientManager.getClient(network);
    const previewAssets = (await publicClient.readContract({
      abi: vaultRedeemAbi,
      address: vaultAddress,
      args: [sharesAmount],
      functionName: "previewRedeem"
    })) as bigint;

    if (previewAssets < minOutputRaw) {
      throw this.createRecoverableError(
        `MorphoRedeemHandler: previewRedeem=${previewAssets} below minOutputRaw=${minOutputRaw}; aborting before broadcast`
      );
    }

    const presigned = this.getPresignedTransaction(state, "morphoRedeem");
    if (!presigned) {
      throw this.createUnrecoverableError("Missing presigned transaction for morphoRedeem phase");
    }

    const txHash = (await this.evmClientManager.sendRawTransactionWithRetry(
      network,
      presigned.txData as `0x${string}`
    )) as `0x${string}`;
    logger.info(`MorphoRedeemHandler: Redeem tx broadcast: ${txHash}`);

    state = await state.update({
      state: { ...state.state, morphoRedeemTxHash: txHash }
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (!receipt || receipt.status !== "success") {
      throw this.createRecoverableError(`MorphoRedeemHandler: Redeem transaction ${txHash} failed on chain`);
    }

    // Layer 2: parse the Withdraw event. ERC-4626 Withdraw event signature is
    // Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)
    // TODO this is either a good idea, or a bad one if this signature can change.
    const withdrawEventSig = "0xfbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db";
    let parsedAssets: bigint | null = null;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== vaultAddress.toLowerCase()) continue;
      if (log.topics[0]?.toLowerCase() !== withdrawEventSig) continue;
      if (log.data.length >= 66) {
        // data = abi.encode(uint256 assets, uint256 shares) => 32 + 32 bytes
        parsedAssets = BigInt(log.data.slice(0, 66));
        break;
      }
    }
    if (parsedAssets !== null) {
      if (parsedAssets < minOutputRaw) {
        throw this.createRecoverableError(
          `MorphoRedeemHandler: Withdraw event assets=${parsedAssets} below minOutputRaw=${minOutputRaw}`
        );
      }
      logger.info(`MorphoRedeemHandler: Withdraw event assets=${parsedAssets} >= minOutputRaw=${minOutputRaw}`);
      const updated = await state.update({
        state: { ...state.state, morphoRedeemActualOutputRaw: parsedAssets.toString() }
      });
      return updated;
    }
    logger.info(
      "MorphoRedeemHandler: No Withdraw event found in receipt (non-standard vault); falling back to balance polling"
    );

    // Layer 3: balance polling fallback
    await this.verifyUsdcBalance(network, assetAddress, ephemeralAddress, minOutputRaw);
    return state;
  }

  private async verifyUsdcBalance(
    network: EvmNetworks,
    assetAddress: `0x${string}`,
    ephemeralAddress: `0x${string}`,
    minOutputRaw: bigint
  ): Promise<void> {
    const client = this.evmClientManager.getClient(network);
    const deadline = Date.now() + EVM_BALANCE_CHECK_TIMEOUT_MS;
    let lastBalance = 0n;

    while (Date.now() < deadline) {
      lastBalance = (await client.readContract({
        abi: erc20Abi,
        address: assetAddress,
        args: [ephemeralAddress],
        functionName: "balanceOf"
      })) as bigint;

      if (lastBalance >= minOutputRaw) {
        logger.info(`MorphoRedeemHandler: USDC balance verified: ${lastBalance} >= ${minOutputRaw}`);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, BALANCE_POLLING_INTERVAL_MS));
    }

    throw this.createRecoverableError(
      `MorphoRedeemHandler: Timed out waiting for USDC balance >= ${minOutputRaw} on ${ephemeralAddress} (last seen: ${lastBalance})`
    );
  }
}

export default new MorphoRedeemHandler();
