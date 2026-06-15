import { EvmClientManager, EvmNetworks, isSignedTypedData, Networks, RampPhase, SignedTypedData } from "@vortexfi/shared";
import { privateKeyToAccount } from "viem/accounts";
import logger from "../../../../config/logger";
import { config } from "../../../../config/vars";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

const permitAbi = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" }
    ],
    name: "permit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

const allowanceAbi = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

const ALLOWANCE_POLL_INTERVAL_MS = 2_000;
const ALLOWANCE_POLL_TIMEOUT_MS = 120_000;

type VrsSignature = { v: number; r: `0x${string}`; s: `0x${string}` };

const ETHEREUM_NETWORK: EvmNetworks = Networks.Ethereum;

function resolveMorphoNetwork(meta: StateMetadata): EvmNetworks {
  return (meta.morphoNetwork as EvmNetworks | undefined) ?? ETHEREUM_NETWORK;
}

/**
 * Phase description:
 *  The user signs a single EIP-2612 Permit typed data on the Morpho vault (spender = ephemeral).
 *  Two presignedTxs are registered under phase "morphoPermitExecute":
 *    1. SignedTypedData entry signed by the user (nonce 0, signer = userAddress)
 *    2. Raw ERC-20 transferFrom tx signed by the EVM ephemeral (nonce 0, signer = evmEphemeral)
 *  This handler:
 *    a. Reads the SignedTypedData, verifies signature, and broadcasts vault.permit() using
 *       the executor key. permit() does not require the spender to be the caller, so the
 *       executor (which has gas at this point) can submit it.
 *    b. Waits for the permit receipt.
 *    c. Broadcasts the presigned transferFrom tx (the spender, the ephemeral, is the only
 *       one who can call transferFrom on the allowance it was just granted).
 *    d. Waits for the transferFrom receipt.
 *  After both txs land, the MorphoRedeemHandler can call vault.redeem on the ephemeral.
 */
export class MorphoPermitExecuteHandler extends BasePhaseHandler {
  private evmClientManager: EvmClientManager;

  constructor() {
    super();
    this.evmClientManager = EvmClientManager.getInstance();
  }

  public getPhaseName(): RampPhase {
    return "morphoPermitExecute";
  }

  private getExecutorWallet(network: EvmNetworks) {
    const account = privateKeyToAccount(config.secrets.moonbeamExecutorPrivateKey as `0x${string}`);
    return {
      publicClient: this.evmClientManager.getClient(network),
      walletClient: this.evmClientManager.getWalletClient(network, account)
    };
  }

  private async waitForReceipt(network: EvmNetworks, hash: `0x${string}`, label: string): Promise<void> {
    const { publicClient } = this.getExecutorWallet(network);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (!receipt || receipt.status !== "success") {
      throw this.createRecoverableError(`${label} tx failed: ${hash}`);
    }
  }

  private async awaitAllowance(
    network: EvmNetworks,
    vaultAddress: `0x${string}`,
    owner: `0x${string}`,
    spender: `0x${string}`,
    expected: bigint
  ): Promise<void> {
    const { publicClient } = this.getExecutorWallet(network);
    const startedAt = Date.now();
    let lastObserved = 0n;
    while (Date.now() - startedAt < ALLOWANCE_POLL_TIMEOUT_MS) {
      try {
        const current = (await publicClient.readContract({
          abi: allowanceAbi,
          address: vaultAddress,
          args: [owner, spender],
          functionName: "allowance"
        })) as bigint;
        lastObserved = current;
        if (current >= expected) {
          logger.info(
            `MorphoPermitExecuteHandler: allowance synced for ${vaultAddress} (${owner} -> ${spender}): ${current.toString()}`
          );
          return;
        }
      } catch (err) {
        logger.warn(
          `MorphoPermitExecuteHandler: allowance read failed (${vaultAddress}); will retry: ${(err as Error).message}`
        );
      }
      await new Promise(resolve => setTimeout(resolve, ALLOWANCE_POLL_INTERVAL_MS));
    }
    throw this.createRecoverableError(
      `MorphoPermitExecuteHandler: timed out waiting for allowance to reach ${expected.toString()} on ${vaultAddress} (last observed: ${lastObserved.toString()})`
    );
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    logger.info(`Executing morphoPermitExecute phase for ramp ${state.id}`);

    const meta = state.state as StateMetadata;
    const network = resolveMorphoNetwork(meta);

    if (!meta.evmEphemeralAddress) {
      throw this.createUnrecoverableError("Missing evmEphemeralAddress in state metadata");
    }

    const ephemeralAddress = meta.evmEphemeralAddress as `0x${string}`;

    if (meta.morphoPermitTxHash && meta.morphoPermitTransferFromTxHash) {
      logger.info(`MorphoPermitExecuteHandler: Both permit and transferFrom already broadcast for ramp ${state.id}, verifying`);
      const publicClient = this.evmClientManager.getClient(network);
      for (const [label, hash] of [
        ["permit", meta.morphoPermitTxHash],
        ["transferFrom", meta.morphoPermitTransferFromTxHash]
      ] as const) {
        const receipt = await publicClient.getTransactionReceipt({ hash });
        if (!receipt || receipt.status !== "success") {
          throw this.createRecoverableError(`MorphoPermitExecuteHandler: existing ${label} tx ${hash} is not successful`);
        }
      }
      return state;
    }

    // Find both presigned entries for this phase
    const allPresigned = state.presignedTxs?.filter(tx => tx.phase === "morphoPermitExecute") ?? [];
    const permitPresigned = allPresigned.find(tx => tx.signer.toLowerCase() === state.state.walletAddress?.toLowerCase());
    const transferFromPresigned = allPresigned.find(tx => tx.signer.toLowerCase() === ephemeralAddress.toLowerCase());

    if (!permitPresigned) {
      throw this.createUnrecoverableError("Missing user-signed permit presignedTx for morphoPermitExecute");
    }
    if (!transferFromPresigned) {
      throw this.createUnrecoverableError("Missing ephemeral-signed transferFrom presignedTx for morphoPermitExecute");
    }

    // ── Step 1: broadcast vault.permit via executor ──
    const permitData = permitPresigned.txData;
    if (!isSignedTypedData(permitData)) {
      throw this.createUnrecoverableError("morphoPermitExecute: user presignedTx is not a SignedTypedData");
    }
    const permitTypedData: SignedTypedData = permitData;
    const sig = permitTypedData.signature as VrsSignature | undefined;
    if (!sig) {
      throw this.createUnrecoverableError("morphoPermitExecute: permit signature missing from user signed typed data");
    }
    const token = permitTypedData.domain.verifyingContract as `0x${string}`;
    const owner = permitTypedData.message.owner as `0x${string}`;
    const value = BigInt(permitTypedData.message.value as string);
    const deadline = BigInt(permitTypedData.message.deadline as string);

    if (deadline * 1000n < BigInt(Date.now())) {
      throw this.createUnrecoverableError("Permit deadline already passed;");
    }

    if (!meta.morphoPermitTxHash) {
      const { walletClient } = this.getExecutorWallet(network);
      const permitHash = await walletClient.writeContract({
        abi: permitAbi,
        address: token,
        args: [owner, ephemeralAddress, value, deadline, sig.v, sig.r, sig.s],
        functionName: "permit"
      });
      logger.info(`MorphoPermitExecuteHandler: Permit tx sent: ${permitHash}`);

      state = await state.update({ state: { ...state.state, morphoPermitTxHash: permitHash } });
      await this.waitForReceipt(network, permitHash, "Permit");
    } else {
      logger.info(`MorphoPermitExecuteHandler: Permit already broadcast (${meta.morphoPermitTxHash})`);
    }

    // ── Step 1.5: await allowance RPC sync ──
    // `waitForTransactionReceipt` only confirms the tx is mined on the source node;
    // downstream public RPCs may lag in their state view. Poll the vault's allowance
    // until it reflects the post-permit value, otherwise the subsequent transferFrom
    // will revert with "insufficient allowance".
    await this.awaitAllowance(network, token, owner, ephemeralAddress, value);

    // ── Step 2: broadcast ephemeral-signed transferFrom ──
    if (!meta.morphoPermitTransferFromTxHash) {
      const signedTxHex = transferFromPresigned.txData as string;
      const txHash = (await this.evmClientManager.sendRawTransactionWithRetry(
        network,
        signedTxHex as `0x${string}`
      )) as `0x${string}`;
      logger.info(`MorphoPermitExecuteHandler: transferFrom tx broadcast: ${txHash}`);

      const publicClient = this.evmClientManager.getClient(network);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (!receipt || receipt.status !== "success") {
        throw this.createRecoverableError(`MorphoPermitExecuteHandler: transferFrom tx ${txHash} failed on chain`);
      }
      state = await state.update({ state: { ...state.state, morphoPermitTransferFromTxHash: txHash } });
    } else {
      logger.info(`MorphoPermitExecuteHandler: transferFrom already broadcast (${meta.morphoPermitTransferFromTxHash})`);
    }

    logger.info(`MorphoPermitExecuteHandler: Permit + transferFrom confirmed for ramp ${state.id}`);
    return state;
  }
}

export default new MorphoPermitExecuteHandler();
