import { EphemeralAccountType, EvmClientManager, getNetworkId, type PresignedTx, type RampPhase } from "@vortexfi/shared";
import { encodeFunctionData, keccak256 } from "viem";
import logger from "../../../../../../config/logger";
import type RampState from "../../../../../../models/rampState.model";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { validatePresignedEvmTransactionAgainstUnsigned } from "../../../../transactions/validation";
import { throwIfAborted } from "../../core/cancellation";
import { getEvmFundingAccount } from "../../core/evm-funding";
import { FinancialOperationRejectedError } from "../../core/financial-operation";
import { MONERIUM_ISSUE_NETWORKS } from "../monerium-issue/simulation";
import { MONERIUM_SELF_TRANSFER_GAS_LIMIT, moneriumPermitAbi } from "./contract";
import type { MoneriumSelfTransferRegistrationFacts } from "./registration";
import { MoneriumSelfTransferContext } from "./simulation";
import { type MoneriumTransferExpectation, validateMoneriumPermit, validateMoneriumTransfer } from "./validation";

interface MoneriumSelfTransferState extends MoneriumSelfTransferRegistrationFacts {
  allowanceBeforeTransferRaw?: string;
  permitInvalidation?: { reason: "expired" | "nonce-consumed"; observedNonce: string };
  permitTxHash?: `0x${string}`;
  transferTxHash?: `0x${string}`;
}

interface Receipt {
  status: "success" | "reverted";
}

export interface MoneriumSelfTransferExecutionDependencies {
  getAllowance(owner: `0x${string}`, spender: `0x${string}`): Promise<bigint>;
  getPermitNonce(owner: `0x${string}`): Promise<bigint>;
  getReceipt(hash: `0x${string}`): Promise<Receipt | null>;
  getTransactionCount(address: `0x${string}`): Promise<number>;
  sendPermit(
    args: readonly [`0x${string}`, `0x${string}`, bigint, bigint, number, `0x${string}`, `0x${string}`]
  ): Promise<`0x${string}`>;
  sendRawTransaction(transaction: `0x${string}`): Promise<`0x${string}`>;
  waitForReceipt(hash: `0x${string}`): Promise<Receipt>;
}

function defaultDependencies(
  network: MoneriumSelfTransferRegistrationFacts["chain"],
  tokenAddress: `0x${string}`
): MoneriumSelfTransferExecutionDependencies {
  const manager = EvmClientManager.getInstance();
  const client = manager.getClient(network);
  const wallet = manager.getWalletClient(network, getEvmFundingAccount(network));
  return {
    getAllowance: (owner, spender) =>
      client.readContract({
        abi: [
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
        ],
        address: tokenAddress,
        args: [owner, spender],
        functionName: "allowance"
      }),
    getPermitNonce: owner =>
      client.readContract({
        abi: [
          {
            inputs: [{ name: "owner", type: "address" }],
            name: "nonces",
            outputs: [{ name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function"
          }
        ],
        address: tokenAddress,
        args: [owner],
        functionName: "nonces"
      }),
    async getReceipt(hash) {
      try {
        return await client.getTransactionReceipt({ hash });
      } catch {
        return null;
      }
    },
    getTransactionCount: address => client.getTransactionCount({ address }),
    sendPermit: args =>
      wallet.sendTransaction({
        data: encodeFunctionData({ abi: moneriumPermitAbi, args, functionName: "permit" }),
        gas: MONERIUM_SELF_TRANSFER_GAS_LIMIT,
        to: tokenAddress
      }),
    sendRawTransaction: async transaction => (await manager.sendRawTransactionWithRetry(network, transaction)) as `0x${string}`,
    waitForReceipt: hash => client.waitForTransactionReceipt({ hash })
  };
}

export class MoneriumSelfTransferExecutor extends BasePhaseHandler {
  constructor(private readonly injectedDependencies?: MoneriumSelfTransferExecutionDependencies) {
    super();
  }

  public getPhaseName(): RampPhase {
    return "moneriumOnrampSelfTransfer";
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    const blockState = this.getState(state);
    const ephemeral = state.state.accountAddresses?.[EphemeralAccountType.EVM] ?? state.state.evmEphemeralAddress;
    if (!ephemeral) throw this.createUnrecoverableError("MoneriumSelfTransfer is missing its EVM ephemeral account");
    const tokenAddress = MONERIUM_ISSUE_NETWORKS[blockState.chain].eureAddress;
    const chainId = getNetworkId(blockState.chain);
    if (chainId === undefined) {
      throw this.createUnrecoverableError(`MoneriumSelfTransfer requires the ${blockState.chain} chain ID`);
    }
    const expectation: MoneriumTransferExpectation = {
      amountRaw: blockState.amountRaw,
      chainId,
      owner: blockState.owner as `0x${string}`,
      recipient: ephemeral as `0x${string}`,
      signer: ephemeral as `0x${string}`,
      tokenAddress
    };
    const permitTx = this.findTransaction(state.presignedTxs ?? [], blockState.owner, "permit");
    const permitBlueprint = this.findTransaction(state.unsignedTxs, blockState.owner, "permit blueprint");
    const transferTx = this.findTransaction(state.presignedTxs ?? [], ephemeral, "transferFrom");
    const transferBlueprint = this.findTransaction(state.unsignedTxs, ephemeral, "transferFrom blueprint");
    const permit = validateMoneriumPermit(permitTx, permitBlueprint, expectation);
    await validatePresignedEvmTransactionAgainstUnsigned(transferTx, transferBlueprint);
    const transfer = await validateMoneriumTransfer(transferTx, expectation);
    const dependencies = this.injectedDependencies ?? defaultDependencies(blockState.chain, tokenAddress);

    await this.consumeOrInvalidatePermit(state, dependencies, expectation, permit, signal);
    const observedAllowance = await dependencies.getAllowance(expectation.owner, expectation.recipient);
    const persistedAllowance = this.getState(state).allowanceBeforeTransferRaw;
    const allowanceBeforeTransfer = persistedAllowance ? BigInt(persistedAllowance) : observedAllowance;
    if (allowanceBeforeTransfer < BigInt(expectation.amountRaw)) {
      throw this.createRecoverableError("MoneriumSelfTransfer permit did not establish the exact transfer allowance");
    }
    await this.broadcastTransfer(
      state,
      dependencies,
      transferTx,
      transfer.hashInput,
      transfer.nonce,
      allowanceBeforeTransfer,
      observedAllowance,
      signal
    );

    const allowanceAfterTransfer = await dependencies.getAllowance(expectation.owner, expectation.recipient);
    const expectedAllowance = allowanceBeforeTransfer - BigInt(expectation.amountRaw);
    if (allowanceAfterTransfer !== expectedAllowance) {
      throw this.createReconciliationRequiredError(
        `MoneriumSelfTransfer allowance is ${allowanceAfterTransfer}, expected ${expectedAllowance} after transfer`
      );
    }
    return state;
  }

  private async consumeOrInvalidatePermit(
    state: RampState,
    dependencies: MoneriumSelfTransferExecutionDependencies,
    expectation: MoneriumTransferExpectation,
    permit: ReturnType<typeof validateMoneriumPermit>,
    signal?: AbortSignal
  ): Promise<void> {
    const persisted = this.getState(state);
    const currentNonce = await dependencies.getPermitNonce(expectation.owner);
    if (currentNonce < permit.nonce) {
      throw this.createUnrecoverableError(
        `MoneriumSelfTransfer permit nonce ${permit.nonce} is ahead of current nonce ${currentNonce}`
      );
    }
    if (!persisted.permitTxHash && (currentNonce > permit.nonce || permit.deadline <= BigInt(Math.floor(Date.now() / 1000)))) {
      await this.updateState(state, {
        permitInvalidation: {
          observedNonce: currentNonce.toString(),
          reason: currentNonce > permit.nonce ? "nonce-consumed" : "expired"
        }
      });
      return;
    }

    const result = await this.runFinancialOperation(state, {
      attemptClass: "monerium-permit",
      externalId: value => value.hash,
      perform: async () => {
        throwIfAborted(signal);
        const hash = await dependencies.sendPermit([
          expectation.owner,
          expectation.recipient,
          BigInt(expectation.amountRaw),
          permit.deadline,
          permit.signature.v,
          permit.signature.r,
          permit.signature.s
        ]);
        await this.updateState(state, { permitTxHash: hash });
        await this.requireSuccessfulReceipt(dependencies, hash, "permit");
        return { hash };
      },
      provider: this.getState(state).chain,
      reconcile: async () => {
        const hash = this.getState(state).permitTxHash;
        if (!hash) return null;
        const receipt = await dependencies.getReceipt(hash);
        if (!receipt) return null;
        if (receipt.status !== "success") throw new FinancialOperationRejectedError(`Monerium permit ${hash} reverted`);
        return { hash };
      },
      request: {
        deadline: permit.deadline.toString(),
        nonce: permit.nonce.toString(),
        owner: expectation.owner,
        spender: expectation.recipient,
        tokenAddress: expectation.tokenAddress,
        value: expectation.amountRaw
      },
      retryFailed: true,
      signal
    });
    await this.updateState(state, { permitTxHash: result.hash });
    await this.requireSuccessfulReceipt(dependencies, result.hash, "permit");
    const consumedNonce = await dependencies.getPermitNonce(expectation.owner);
    if (consumedNonce <= permit.nonce) {
      throw this.createReconciliationRequiredError("Monerium permit receipt succeeded without consuming its token nonce");
    }
  }

  private async broadcastTransfer(
    state: RampState,
    dependencies: MoneriumSelfTransferExecutionDependencies,
    transaction: PresignedTx,
    serializedTransaction: `0x${string}`,
    signedNonce: number,
    allowanceBeforeTransfer: bigint,
    observedAllowance: bigint,
    signal?: AbortSignal
  ): Promise<void> {
    let persisted = this.getState(state);
    if (!persisted.allowanceBeforeTransferRaw) {
      await this.updateState(state, { allowanceBeforeTransferRaw: allowanceBeforeTransfer.toString() });
      persisted = this.getState(state);
    }
    const deterministicHash = keccak256(serializedTransaction);
    if (!persisted.transferTxHash) {
      const currentNonce = await dependencies.getTransactionCount(transaction.signer as `0x${string}`);
      if (currentNonce !== signedNonce || observedAllowance !== allowanceBeforeTransfer) {
        const receipt = await dependencies.getReceipt(deterministicHash);
        if (receipt?.status === "success") {
          await this.updateState(state, { transferTxHash: deterministicHash });
          persisted = this.getState(state);
        } else {
          const reason =
            currentNonce !== signedNonce
              ? `signed nonce ${signedNonce} does not match current nonce ${currentNonce}`
              : "allowance changed before broadcast";
          throw this.createReconciliationRequiredError(`Monerium transfer ${reason}`);
        }
      }
    }
    const result = await this.runFinancialOperation(state, {
      attemptClass: "monerium-transfer-from",
      externalId: value => value.hash,
      perform: async () => {
        throwIfAborted(signal);
        const hash = await dependencies.sendRawTransaction(serializedTransaction);
        if (hash.toLowerCase() !== deterministicHash.toLowerCase()) {
          throw new Error(`Monerium transfer returned hash ${hash}, expected ${deterministicHash}`);
        }
        await this.updateState(state, { transferTxHash: hash });
        await this.requireSuccessfulReceipt(dependencies, hash, "transferFrom");
        return { hash };
      },
      provider: transaction.network,
      reconcile: async () => {
        const hash = this.getState(state).transferTxHash ?? deterministicHash;
        const receipt = await dependencies.getReceipt(hash);
        if (!receipt) return null;
        if (receipt.status !== "success") {
          throw new FinancialOperationRejectedError(`Monerium transferFrom ${hash} reverted`);
        }
        return { hash };
      },
      request: { network: transaction.network, signedTransaction: serializedTransaction },
      signal
    });
    await this.updateState(state, { transferTxHash: result.hash });
    await this.requireSuccessfulReceipt(dependencies, result.hash, "transferFrom");
    logger.info(`MoneriumSelfTransfer confirmed exact transfer ${result.hash}`);
  }

  private findTransaction(transactions: readonly PresignedTx[], signer: string, label: string): PresignedTx {
    const transaction = transactions.find(
      value => value.phase === this.getPhaseName() && value.signer.toLowerCase() === signer.toLowerCase()
    );
    if (!transaction) throw this.createUnrecoverableError(`MoneriumSelfTransfer is missing its ${label}`);
    return transaction;
  }

  private getState(state: RampState): MoneriumSelfTransferState {
    const blockState = state.state.blockState?.[MoneriumSelfTransferContext.key] as MoneriumSelfTransferState | undefined;
    if (!blockState) throw this.createUnrecoverableError("MoneriumSelfTransfer is missing namespaced block state");
    return blockState;
  }

  private async updateState(state: RampState, patch: Partial<MoneriumSelfTransferState>): Promise<void> {
    await state.update({
      state: {
        ...state.state,
        blockState: {
          ...state.state.blockState,
          [MoneriumSelfTransferContext.key]: { ...this.getState(state), ...patch }
        }
      }
    });
  }

  private async requireSuccessfulReceipt(
    dependencies: MoneriumSelfTransferExecutionDependencies,
    hash: `0x${string}`,
    label: string
  ): Promise<void> {
    const receipt = await dependencies.waitForReceipt(hash);
    if (receipt.status !== "success") {
      throw new FinancialOperationRejectedError(`Monerium ${label} transaction ${hash} reverted`);
    }
  }
}
