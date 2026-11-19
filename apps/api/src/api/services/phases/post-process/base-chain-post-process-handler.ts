import { CleanupPhase, EvmClientManager, EvmNetworks, Networks } from "@vortexfi/shared";
import { Transaction as EvmTransaction } from "ethers";
import { erc20Abi } from "viem";
import logger from "../../../../config/logger";
import RampState from "../../../../models/rampState.model";
import { getEvmFundingAccount, runSerializedEvmFundingOperation } from "../blocks/core/evm-funding";
import { BasePostProcessHandler } from "./base-post-process-handler";

const BASE_CLEANUP_PHASES: CleanupPhase[] = [
  "baseCleanupBrla",
  "baseCleanupUsdc",
  "baseCleanupEurc",
  "baseCleanupAxlUsdc",
  "baseCleanupPaxg"
];

interface Sweep {
  balance: bigint;
  nonce: number;
  phase: CleanupPhase;
  signedApproveTx: `0x${string}`;
  tokenAddress: `0x${string}`;
}

export class BaseChainPostProcessHandler extends BasePostProcessHandler {
  protected readonly network: EvmNetworks = Networks.Base;
  protected readonly cleanupPhases: CleanupPhase[] = BASE_CLEANUP_PHASES;

  public getCleanupName(): CleanupPhase {
    return "baseCleanupBrla";
  }

  protected override createErrorObject(error: Error | string, phase?: CleanupPhase): Error {
    const errorMessage = error instanceof Error ? error.message : error;
    const handlerName = phase ?? this.getCleanupName();
    logger.error(`Cleanup phase '${handlerName}' failed: ${errorMessage}`);
    return new Error(`Cleanup phase '${handlerName}' failed: ${errorMessage}`);
  }

  public shouldProcess(state: RampState): boolean {
    if (state.currentPhase !== "complete") {
      return false;
    }

    return this.cleanupPhases.some(phase => this.getPresignedTransaction(state, phase) !== undefined);
  }

  public async process(state: RampState): Promise<[boolean, Error | null]> {
    const ephemeralAddress = state.state.evmEphemeralAddress as `0x${string}` | undefined;
    if (!ephemeralAddress) {
      return [false, this.createErrorObject("No EVM ephemeral address found in state")];
    }

    let sweeps: Sweep[];
    try {
      sweeps = await this.readSweeps(state, ephemeralAddress);
    } catch (e) {
      return [false, this.createErrorObject(`Error in ${this.network} cleanup: ${e}`)];
    }
    // The approvals are presigned at consecutive ephemeral nonces, so they go out in that order. One for a token with
    // nothing to sweep is still sent when a later token has a balance: the later approval cannot be mined before it.
    const last = sweeps.map(sweep => sweep.balance > 0n).lastIndexOf(true);
    for (const sweep of sweeps.slice(0, last + 1)) {
      const [ok, err] = await this.sweepToken(state, ephemeralAddress, sweep);
      if (!ok) {
        return [false, err];
      }
    }

    return [true, null];
  }

  /** The ramp's presigned cleanup approvals in nonce order, each with the balance its token has on the ephemeral. */
  private async readSweeps(state: RampState, ephemeralAddress: `0x${string}`): Promise<Sweep[]> {
    const publicClient = EvmClientManager.getInstance().getClient(this.network);
    const sweeps: Sweep[] = [];
    for (const phase of this.cleanupPhases) {
      const presignedTx = this.getPresignedTransaction(state, phase);
      if (!presignedTx) {
        continue;
      }
      const signedApproveTx = presignedTx.txData as `0x${string}`;
      const parsedTx = EvmTransaction.from(signedApproveTx);
      const tokenAddress = parsedTx.to as `0x${string}` | null;
      if (!tokenAddress) {
        throw new Error(`Could not extract token address from presigned ${phase} tx`);
      }
      const balance = await publicClient.readContract({
        abi: erc20Abi,
        address: tokenAddress,
        args: [ephemeralAddress],
        functionName: "balanceOf"
      });
      sweeps.push({ balance, nonce: parsedTx.nonce, phase, signedApproveTx, tokenAddress });
    }
    return sweeps.sort((left, right) => left.nonce - right.nonce);
  }

  private async sweepToken(
    state: RampState,
    ephemeralAddress: `0x${string}`,
    { balance, nonce, phase, signedApproveTx, tokenAddress }: Sweep
  ): Promise<[boolean, Error | null]> {
    try {
      const evmClientManager = EvmClientManager.getInstance();
      const publicClient = evmClientManager.getClient(this.network);

      const liveNonce = await publicClient.getTransactionCount({ address: ephemeralAddress });
      if (nonce > liveNonce) {
        return [
          false,
          this.createErrorObject(
            `Approve tx for ${phase} is signed for nonce ${nonce}, but the ephemeral is at ${liveNonce}, so it cannot be mined`,
            phase
          )
        ];
      }
      // A lower nonce is already used: an earlier run of this cleanup sent the approval, and it cannot be sent again.
      if (nonce === liveNonce) {
        const txHash = await evmClientManager.sendRawTransactionWithRetry(this.network, signedApproveTx);
        const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
        if (!approveReceipt || approveReceipt.status !== "success") {
          return [false, this.createErrorObject(`Approve tx ${txHash} for ${phase} failed`, phase)];
        }
      }

      if (balance === 0n) {
        logger.info(`${this.network} cleanup ${phase} for ramp ${state.id}: ephemeral has zero balance, nothing to pull`);
        return [true, null];
      }

      const fundingAccount = getEvmFundingAccount(this.network);
      const walletClient = evmClientManager.getWalletClient(this.network, fundingAccount);

      const [transferFromHash, transferReceipt] = await runSerializedEvmFundingOperation(this.network, async () => {
        const hash = await walletClient.writeContract({
          abi: erc20Abi,
          address: tokenAddress,
          args: [ephemeralAddress, fundingAccount.address, balance],
          functionName: "transferFrom"
        });
        return [hash, await publicClient.waitForTransactionReceipt({ hash })] as const;
      });
      if (!transferReceipt || transferReceipt.status !== "success") {
        return [false, this.createErrorObject(`transferFrom tx ${transferFromHash} for ${phase} failed`, phase)];
      }

      logger.info(`Successfully swept ${balance} tokens for ${this.network} cleanup ${phase} on ramp ${state.id}`);
      return [true, null];
    } catch (e) {
      return [false, this.createErrorObject(`Error in ${this.network} cleanup ${phase}: ${e}`, phase)];
    }
  }
}

export default new BaseChainPostProcessHandler();
