import {
  ApiManager,
  EvmClientManager,
  EvmNetworks,
  FiatToken,
  getNetworkFromDestination,
  isAlfredpayToken,
  isEvmTransactionData,
  multiplyByPowerOfTen,
  Networks,
  QuoteError,
  RampDirection,
  RampPhase,
  waitUntilTrueWithTimeout
} from "@vortexfi/shared";
import logger from "../../../../../../config/logger";
import { config } from "../../../../../../config/vars";
import {
  BASE_EPHEMERAL_STARTING_BALANCE_UNITS,
  MOONBEAM_EVM_SOURCE_STARTING_BALANCE_UNITS,
  POLYGON_EPHEMERAL_STARTING_BALANCE_UNITS
} from "../../../../../../constants/constants";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { APIError } from "../../../../../errors/api-error";
import { PhaseError } from "../../../../../errors/phase-error";
import { fundEphemeralAccount } from "../../../../pendulum/pendulum.service";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { verifyUserSubmittedTxByHash } from "../../../../phases/helpers/user-tx-verifier";
import { StateMetadata } from "../../../../phases/meta-state-types";
import { PresignedEvmTransactionRebindError } from "../../../../transactions/validation";
import { abortableCall, throwIfAborted } from "../../core/cancellation";
import {
  calculateDestinationFundingShortfallRaw,
  calculateSourceEvmFundingRequirementRaw,
  getDynamicDestinationEvmFundingNetwork,
  isDestinationEvmEphemeralFunded,
  isPendulumEphemeralFunded,
  LEGACY_DESTINATION_EVM_FUNDING_AMOUNTS
} from "../../core/destination-funding";
import {
  assertEvmTreasuryFundingFeeWithinQuote,
  calculateQuotedPresignedExecutionBudgetRaw,
  EVM_DESTINATION_FUNDING_PROGRAM_VERSION
} from "../../core/evm-destination-gas";
import { getEvmFundingAccount } from "../../core/evm-funding";
import { type EvmDestinationGasQuote, getBlockMetadata, getBlockState, getFlowMetadata } from "../../core/metadata";
import { getNativePrefunding } from "../../core/prepare";
import { AssethubOfframpSourceContext, type AssethubOfframpSourceRegistrationFacts } from "../assethub-offramp-source";
import { EvmOfframpSourceContext, EvmOfframpSourceMetadata } from "../evm-offramp-source/simulation";
import { FundEphemeralContext } from "./simulation";

export class FundEphemeralExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "fundEphemeral";
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }
    const flowMetadata = getFlowMetadata(quote.metadata);
    const blocks = flowMetadata.blocks;
    const destinationGasQuote = flowMetadata.globals.evmDestinationGas;
    if (destinationGasQuote && destinationGasQuote.programVersion !== EVM_DESTINATION_FUNDING_PROGRAM_VERSION) {
      throw new Error(`Unsupported EVM destination funding program ${String(destinationGasQuote.programVersion)}`);
    }
    if (blocks[AssethubOfframpSourceContext.key]) {
      await this.verifyAssethubSourceTransaction(state);
      const substrateAddress = state.state.substrateEphemeralAddress;
      if (!substrateAddress) throw new Error("FundEphemeralExecutor: missing Substrate ephemeral for AssetHub route");
      const pendulum = await ApiManager.getInstance().getApi("pendulum");
      if (!(await isPendulumEphemeralFunded(substrateAddress, pendulum))) {
        await this.fundSubstrateEphemeralAccount(state, substrateAddress, true, "assethub-substrate-native-funding", signal);
      }
      return state;
    }

    const { evmEphemeralAddress } = state.state as StateMetadata;
    if (!evmEphemeralAddress) {
      throw new Error("FundEphemeralExecutor: State metadata corrupted, missing evmEphemeralAddress. This is a bug.");
    }
    await this.verifyUserSubmittedSourceTransactions(state, quote, signal);
    const metadata = blocks[EvmOfframpSourceContext.key]
      ? (blocks[EvmOfframpSourceContext.key] as EvmOfframpSourceMetadata)
      : blocks.alfredpayOfframp
        ? (blocks.alfredpayOfframp as { network?: string; fromNetwork: EvmNetworks })
        : getBlockMetadata(quote.metadata, FundEphemeralContext);
    const sourceNetwork = (metadata.network ?? (metadata as { fromNetwork?: EvmNetworks }).fromNetwork) as EvmNetworks;

    try {
      if (sourceNetwork === Networks.Moonbeam) {
        const substrateAddress = state.state.substrateEphemeralAddress;
        if (!substrateAddress) throw new Error("FundEphemeralExecutor: missing Substrate ephemeral for Moonbeam route");
        const pendulum = await ApiManager.getInstance().getApi("pendulum");
        if (!(await isPendulumEphemeralFunded(substrateAddress, pendulum))) {
          await this.fundSubstrateEphemeralAccount(state, substrateAddress, false, "moonbeam-substrate-native-funding", signal);
        }
      }
      const sourceClient = EvmClientManager.getInstance().getClient(sourceNetwork);
      const chain = sourceClient.chain;
      if (!chain) {
        throw new Error(`FundEphemeralExecutor: Could not get chain info for ${sourceNetwork}`);
      }
      const fixedFundingUnits =
        sourceNetwork === Networks.Polygon
          ? POLYGON_EPHEMERAL_STARTING_BALANCE_UNITS
          : sourceNetwork === Networks.Moonbeam
            ? destinationGasQuote
              ? MOONBEAM_EVM_SOURCE_STARTING_BALANCE_UNITS
              : LEGACY_DESTINATION_EVM_FUNDING_AMOUNTS[Networks.Moonbeam]
            : BASE_EPHEMERAL_STARTING_BALANCE_UNITS;
      const fixedFundingRaw = BigInt(multiplyByPowerOfTen(fixedFundingUnits, chain.nativeCurrency.decimals).toFixed());
      const plannedNativeValueRaw = getNativePrefunding(state.state.transactionPlan, sourceNetwork, evmEphemeralAddress);
      const destinationNetwork = getNetworkFromDestination(state.to);
      const dynamicDestinationNetwork = destinationGasQuote
        ? getDynamicDestinationEvmFundingNetwork(
            destinationNetwork,
            state.type === RampDirection.BUY,
            state.state.isDirectTransfer
          )
        : undefined;
      let destinationFundingRaw = 0n;
      if (dynamicDestinationNetwork) {
        if (!destinationGasQuote) {
          throw new Error(`FundEphemeralExecutor: missing ${dynamicDestinationNetwork} destination gas quote`);
        }
        destinationFundingRaw = await this.getDestinationEvmFundingRequirementRaw(
          state,
          dynamicDestinationNetwork,
          destinationGasQuote
        );
      }
      const sameNetworkDestinationLiabilityRaw = dynamicDestinationNetwork === sourceNetwork ? destinationFundingRaw : 0n;
      const requiredFundingRaw = calculateSourceEvmFundingRequirementRaw(
        fixedFundingRaw,
        plannedNativeValueRaw,
        sameNetworkDestinationLiabilityRaw
      );
      const currentBalanceRaw = await sourceClient.getBalance({ address: evmEphemeralAddress as `0x${string}` });

      if (currentBalanceRaw < requiredFundingRaw) {
        logger.info(`Funding ${sourceNetwork} ephemeral account ${evmEphemeralAddress}`);
        await this.fundEvmEphemeralAccount(
          state,
          sourceNetwork,
          requiredFundingRaw - currentBalanceRaw,
          requiredFundingRaw,
          dynamicDestinationNetwork === sourceNetwork ? destinationGasQuote : undefined,
          signal
        );
      } else {
        logger.info(`${sourceNetwork} ephemeral address already funded.`);
      }

      if (dynamicDestinationNetwork && dynamicDestinationNetwork !== sourceNetwork) {
        const isFunded = await isDestinationEvmEphemeralFunded(
          evmEphemeralAddress,
          dynamicDestinationNetwork,
          destinationFundingRaw
        );
        if (!isFunded) {
          logger.info(`Funding EVM ephemeral account ${evmEphemeralAddress} on ${dynamicDestinationNetwork}`);
          await this.fundDestinationEvmEphemeralAccount(
            state,
            dynamicDestinationNetwork,
            destinationFundingRaw,
            destinationGasQuote,
            signal
          );
        } else {
          logger.info(`EVM ephemeral account already funded on ${dynamicDestinationNetwork}.`);
        }
      }

      const legacyDestinationNetwork = destinationGasQuote
        ? undefined
        : getDynamicDestinationEvmFundingNetwork(
            destinationNetwork,
            state.type === RampDirection.BUY,
            state.state.isDirectTransfer
          );
      if (legacyDestinationNetwork) {
        const legacyClient = EvmClientManager.getInstance().getClient(legacyDestinationNetwork);
        const legacyChain = legacyClient.chain;
        if (!legacyChain) {
          throw new Error(`FundEphemeralExecutor: Could not get chain info for ${legacyDestinationNetwork}`);
        }
        const legacyRequiredRaw = BigInt(
          multiplyByPowerOfTen(
            LEGACY_DESTINATION_EVM_FUNDING_AMOUNTS[legacyDestinationNetwork],
            legacyChain.nativeCurrency.decimals
          ).toFixed()
        );
        if (!(await isDestinationEvmEphemeralFunded(evmEphemeralAddress, legacyDestinationNetwork, legacyRequiredRaw))) {
          logger.info(`Legacy-funding EVM ephemeral account ${evmEphemeralAddress} on ${legacyDestinationNetwork}`);
          await this.fundLegacyDestinationEvmEphemeralAccount(state, legacyDestinationNetwork, legacyRequiredRaw, signal);
        }
      }
    } catch (e) {
      logger.error("Error in FundEphemeralExecutor:", e);

      if (e instanceof PhaseError) {
        throw e;
      }

      if (e instanceof APIError && e.message === QuoteError.NetworkFeesTooHigh) {
        throw this.createRecoverableError(QuoteError.NetworkFeesTooHigh);
      }

      if (e instanceof PresignedEvmTransactionRebindError) {
        throw this.createUnrecoverableError(e.message);
      }

      throw this.createRecoverableError("Error funding ephemeral account");
    }

    return state;
  }

  private async verifyAssethubSourceTransaction(state: RampState): Promise<void> {
    if (!state.state.assethubToPendulumHash) {
      throw this.createRecoverableError("AssetHub to Pendulum transaction hash not yet reported by frontend");
    }
    const blueprint = state.unsignedTxs.find(tx => tx.phase === "assethubToPendulum");
    if (!blueprint || blueprint.network !== (config.sandboxEnabled ? Networks.Paseo : Networks.AssetHub)) {
      throw this.createUnrecoverableError("AssetHub to Pendulum transaction blueprint is missing or on the wrong network");
    }
    const facts = getBlockState<AssethubOfframpSourceRegistrationFacts>(state.state, AssethubOfframpSourceContext);
    if (blueprint.signer !== facts.userAddress || typeof blueprint.txData !== "string") {
      throw this.createUnrecoverableError("AssetHub to Pendulum transaction authority does not match registration");
    }
  }

  private async verifyUserSubmittedSourceTransactions(
    state: RampState,
    quote: QuoteTicket,
    signal?: AbortSignal
  ): Promise<void> {
    if (state.type !== RampDirection.SELL) return;
    if (state.from === Networks.AssetHub) return;
    if (isAlfredpayToken(quote.outputCurrency as FiatToken)) return;
    const metadata = getFlowMetadata(quote.metadata).blocks[EvmOfframpSourceContext.key] as
      | EvmOfframpSourceMetadata
      | undefined;
    if (!metadata) return;
    if (state.unsignedTxs.some(tx => tx.phase === "squidRouterNoPermitTransfer")) {
      await verifyUserSubmittedTxByHash({
        fromNetwork: metadata.fromNetwork,
        hash: state.state.squidRouterNoPermitTransferHash as `0x${string}` | undefined,
        label: "User direct USDC transfer to ephemeral",
        presignedPhase: "squidRouterNoPermitTransfer",
        signal,
        state
      });
      return;
    }
    const hasUserSquidSwapBlueprint = state.unsignedTxs.some(
      tx => tx.phase === "squidRouterSwap" && tx.signer.toLowerCase() !== (state.state.evmEphemeralAddress ?? "").toLowerCase()
    );
    if (!hasUserSquidSwapBlueprint) return;

    const approveHash = state.state.squidRouterApproveHash as `0x${string}` | undefined;
    if (approveHash) {
      await verifyUserSubmittedTxByHash({
        fromNetwork: metadata.fromNetwork,
        hash: approveHash,
        label: "User squidRouter approve",
        presignedPhase: "squidRouterApprove",
        signal,
        state
      });
    }
    await verifyUserSubmittedTxByHash({
      fromNetwork: metadata.fromNetwork,
      hash: state.state.squidRouterSwapHash as `0x${string}` | undefined,
      label: "User squidRouter swap",
      presignedPhase: "squidRouterSwap",
      signal,
      state
    });
  }

  protected async fundEvmEphemeralAccount(
    state: RampState,
    network: EvmNetworks,
    fundingAmountRaw: bigint,
    requiredFundingRaw: bigint,
    destinationGasQuote?: EvmDestinationGasQuote,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      const evmClientManager = EvmClientManager.getInstance();
      const networkClient = evmClientManager.getClient(network);
      const chain = networkClient.chain;

      if (!chain) {
        throw new Error(`FundEphemeralExecutor: Could not get chain info for ${network}`);
      }

      const ephemeralAddress = state.state.evmEphemeralAddress;

      const fundingAccount = getEvmFundingAccount(network);
      const walletClient = evmClientManager.getWalletClient(network, fundingAccount);
      let checkedFees: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } | undefined;

      await this.runFinancialOperation(state, {
        attemptClass: destinationGasQuote ? "source-evm-native-funding-v2" : "source-evm-native-funding",
        beforePerform: destinationGasQuote
          ? async () => {
              const fees = await networkClient.estimateFeesPerGas();
              await assertEvmTreasuryFundingFeeWithinQuote(destinationGasQuote, network, fees.maxFeePerGas);
              checkedFees = fees;
            }
          : undefined,
        externalId: result => result.hash,
        perform: async () => {
          throwIfAborted(signal);
          const fees = checkedFees;
          if (destinationGasQuote && !fees) {
            throw new Error(`FundEphemeralExecutor: missing checked ${network} funding fees`);
          }
          const hash = await abortableCall(signal, () =>
            walletClient.sendTransaction({
              ...(fees && destinationGasQuote
                ? {
                    gas: BigInt(destinationGasQuote.fundingGasLimit),
                    maxFeePerGas: fees.maxFeePerGas,
                    maxPriorityFeePerGas: fees.maxPriorityFeePerGas
                  }
                : {}),
              to: ephemeralAddress as `0x${string}`,
              value: fundingAmountRaw
            })
          );
          const receipt = await abortableCall(signal, () =>
            networkClient.waitForTransactionReceipt({
              hash: hash as `0x${string}`
            })
          );
          if (!receipt || receipt.status !== "success") {
            throw new Error(`FundEphemeralExecutor: Transaction ${hash} failed or was not found`);
          }
          return { hash };
        },
        provider: network,
        request: {
          ...(destinationGasQuote
            ? { targetBalanceRaw: requiredFundingRaw.toString() }
            : { amountRaw: fundingAmountRaw.toString() }),
          destination: ephemeralAddress,
          network,
          source: fundingAccount.address
        },
        signal
      });

      // The receipt confirms inclusion, but downstream phases use a different RPC client which
      // may briefly lag behind. Poll the balance until it reflects the funded amount so that
      // subsequent phases (nablaApprove etc.) don't read a stale balance.
      try {
        await waitUntilTrueWithTimeout(
          async () => (await networkClient.getBalance({ address: ephemeralAddress as `0x${string}` })) >= requiredFundingRaw,
          1000,
          30000,
          signal
        );
      } catch (pollError) {
        throw new Error(
          `FundEphemeralExecutor: Funded ${ephemeralAddress} on ${network} but balance not reflected on RPC within timeout: ${pollError}`
        );
      }
    } catch (error) {
      logger.error(`FundEphemeralExecutor: Error during funding ${network} ephemeral:`, error);
      if (error instanceof PhaseError || error instanceof APIError) throw error;
      throw new Error(`FundEphemeralExecutor: Error during funding ${network} ephemeral: ` + error);
    }
  }

  protected async fundDestinationEvmEphemeralAccount(
    state: RampState,
    destinationNetwork: EvmNetworks,
    requiredFundingRaw: bigint,
    destinationGasQuote: EvmDestinationGasQuote | undefined,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      const evmClientManager = EvmClientManager.getInstance();
      const destinationClient = evmClientManager.getClient(destinationNetwork);
      const chain = destinationClient.chain;

      if (!chain) {
        throw new Error(`FundEphemeralExecutor: Could not get chain info for ${destinationNetwork}`);
      }

      const ephemeralAddress = state.state.evmEphemeralAddress;
      const currentBalanceRaw = await destinationClient.getBalance({ address: ephemeralAddress as `0x${string}` });
      const fundingAmountRaw = calculateDestinationFundingShortfallRaw(requiredFundingRaw, currentBalanceRaw);
      if (fundingAmountRaw === 0n) {
        return;
      }

      const fundingAccount = getEvmFundingAccount(destinationNetwork);
      const walletClient = evmClientManager.getWalletClient(destinationNetwork, fundingAccount);
      if (!destinationGasQuote) {
        throw new Error(`FundEphemeralExecutor: missing ${destinationNetwork} destination gas quote`);
      }
      let checkedFees: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } | undefined;

      await this.runFinancialOperation(state, {
        attemptClass: "destination-evm-native-funding-v2",
        beforePerform: async () => {
          const fees = await destinationClient.estimateFeesPerGas();
          await assertEvmTreasuryFundingFeeWithinQuote(destinationGasQuote, destinationNetwork, fees.maxFeePerGas);
          checkedFees = fees;
        },
        externalId: result => result.hash,
        perform: async () => {
          throwIfAborted(signal);
          const fees = checkedFees;
          if (!fees) {
            throw new Error(`FundEphemeralExecutor: missing checked ${destinationNetwork} funding fees`);
          }
          const hash = await abortableCall(signal, () =>
            walletClient.sendTransaction({
              gas: BigInt(destinationGasQuote.fundingGasLimit),
              maxFeePerGas: fees.maxFeePerGas,
              maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
              to: ephemeralAddress as `0x${string}`,
              value: fundingAmountRaw
            })
          );
          const receipt = await abortableCall(signal, () =>
            destinationClient.waitForTransactionReceipt({
              hash: hash as `0x${string}`
            })
          );
          if (!receipt || receipt.status !== "success") {
            throw new Error(`FundEphemeralExecutor: Transaction ${hash} failed or was not found on ${destinationNetwork}`);
          }
          return { hash };
        },
        provider: destinationNetwork,
        request: {
          destination: ephemeralAddress,
          network: destinationNetwork,
          source: fundingAccount.address,
          targetBalanceRaw: requiredFundingRaw.toString()
        },
        signal
      });

      try {
        await waitUntilTrueWithTimeout(
          () => isDestinationEvmEphemeralFunded(ephemeralAddress, destinationNetwork, requiredFundingRaw),
          1000,
          30000,
          signal
        );
      } catch (pollError) {
        throw new Error(
          `FundEphemeralExecutor: Funded ${ephemeralAddress} on ${destinationNetwork} but balance not reflected on RPC within timeout: ${pollError}`
        );
      }
    } catch (error) {
      logger.error(`FundEphemeralExecutor: Error during funding ${destinationNetwork} ephemeral:`, error);
      if (error instanceof PhaseError || error instanceof APIError) throw error;
      throw new Error(`FundEphemeralExecutor: Error during funding ${destinationNetwork} ephemeral: ` + error);
    }
  }

  private async getDestinationEvmFundingRequirementRaw(
    state: RampState,
    destinationNetwork: EvmNetworks,
    destinationGasQuote: EvmDestinationGasQuote
  ): Promise<bigint> {
    const presignedTransfer = this.getPresignedTransaction(state, "destinationTransfer");
    if (!presignedTransfer?.txData || presignedTransfer.network !== destinationNetwork) {
      throw new Error(`FundEphemeralExecutor: missing ${destinationNetwork} destination transfer`);
    }
    const unsignedTransfer = state.unsignedTxs.find(
      transaction =>
        transaction.phase === "destinationTransfer" &&
        transaction.network === destinationNetwork &&
        transaction.nonce === presignedTransfer.nonce &&
        transaction.signer.toLowerCase() === presignedTransfer.signer.toLowerCase()
    );
    if (!unsignedTransfer || !isEvmTransactionData(unsignedTransfer.txData)) {
      throw new Error(`FundEphemeralExecutor: missing ${destinationNetwork} destination transfer blueprint`);
    }
    return calculateQuotedPresignedExecutionBudgetRaw(presignedTransfer, unsignedTransfer, destinationGasQuote);
  }

  private async fundLegacyDestinationEvmEphemeralAccount(
    state: RampState,
    destinationNetwork: EvmNetworks,
    requiredFundingRaw: bigint,
    signal?: AbortSignal
  ): Promise<void> {
    const evmClientManager = EvmClientManager.getInstance();
    const destinationClient = evmClientManager.getClient(destinationNetwork);
    const ephemeralAddress = state.state.evmEphemeralAddress as `0x${string}`;
    const currentBalanceRaw = await destinationClient.getBalance({ address: ephemeralAddress });
    const fundingAmountRaw = calculateDestinationFundingShortfallRaw(requiredFundingRaw, currentBalanceRaw);
    if (fundingAmountRaw === 0n) return;

    const fundingAccount = getEvmFundingAccount(destinationNetwork);
    const walletClient = evmClientManager.getWalletClient(destinationNetwork, fundingAccount);
    await this.runFinancialOperation(state, {
      attemptClass: "destination-evm-native-funding",
      externalId: result => result.hash,
      perform: async () => {
        throwIfAborted(signal);
        const hash = await abortableCall(signal, () =>
          walletClient.sendTransaction({ to: ephemeralAddress, value: fundingAmountRaw })
        );
        const receipt = await abortableCall(signal, () =>
          destinationClient.waitForTransactionReceipt({ hash: hash as `0x${string}` })
        );
        if (!receipt || receipt.status !== "success") {
          throw new Error(`FundEphemeralExecutor: Transaction ${hash} failed or was not found on ${destinationNetwork}`);
        }
        return { hash };
      },
      provider: destinationNetwork,
      request: {
        amountRaw: fundingAmountRaw.toString(),
        destination: ephemeralAddress,
        network: destinationNetwork,
        source: fundingAccount.address
      },
      signal
    });

    await waitUntilTrueWithTimeout(
      () => isDestinationEvmEphemeralFunded(ephemeralAddress, destinationNetwork, requiredFundingRaw),
      1000,
      30000,
      signal
    );
  }

  private async fundSubstrateEphemeralAccount(
    state: RampState,
    substrateAddress: string,
    requiresGlmr: boolean,
    attemptClass: string,
    signal?: AbortSignal
  ): Promise<void> {
    await this.runFinancialOperation(state, {
      attemptClass,
      perform: async () => {
        throwIfAborted(signal);
        const funded = await abortableCall(signal, () => fundEphemeralAccount("pendulum", substrateAddress, requiresGlmr));
        if (!funded) {
          throw new Error(`FundEphemeralExecutor: Pendulum funding outcome is unknown for ${substrateAddress}`);
        }
        return { funded: true };
      },
      provider: "pendulum",
      request: { destination: substrateAddress, requiresGlmr },
      signal
    });
  }
}
