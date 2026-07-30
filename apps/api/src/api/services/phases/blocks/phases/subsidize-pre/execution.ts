import {
  ApiManager,
  checkEvmBalanceForToken,
  EvmClientManager,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  getOnChainTokenDetails,
  getPendulumDetails,
  Networks,
  nativeToDecimal,
  RampCurrency,
  RampDirection,
  RampPhase,
  sleep,
  waitUntilTrueWithTimeout
} from "@vortexfi/shared";
import { Big } from "big.js";
import { encodeFunctionData, erc20Abi } from "viem";
import logger from "../../../../../../config/logger";
import { config } from "../../../../../../config/vars";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { SubsidyToken } from "../../../../../../models/subsidy.model";
import { getFundingAccount } from "../../../../../controllers/subsidize.controller";
import { PhaseError } from "../../../../../errors/phase-error";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { StateMetadata } from "../../../../phases/meta-state-types";
import { priceFeedService } from "../../../../priceFeed.service";
import { abortableCall, throwIfAborted } from "../../core/cancellation";
import { getEvmFundingAccount } from "../../core/evm-funding";
import {
  FinancialOperationReconciliationRequiredError,
  requireFinancialFlowIdentity,
  runFinancialOperation
} from "../../core/financial-operation";
import { getBlockMetadata } from "../../core/metadata";
import { SubsidizePreContext } from "./simulation";

const EVM_SETTLEMENT_DELAY_MS = parseInt(process.env.SUBSIDY_SETTLEMENT_DELAY_MS || "15000", 10);

export class SubsidizePreSwapExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "subsidizePreSwap";
  }

  public getMaxRetries(): number {
    return 200;
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    const metadata = getBlockMetadata(quote.metadata, SubsidizePreContext);

    if (metadata.network === Networks.Pendulum) {
      try {
        const substrateAddress = state.state.substrateEphemeralAddress;
        if (!substrateAddress) throw new Error("SubsidizePreSwapExecutor: missing Substrate ephemeral");
        const manager = ApiManager.getInstance();
        const pendulum = await manager.getApi("pendulum");
        const currencyId = metadata.inputCurrencyId ?? getPendulumDetails(metadata.inputCurrency as RampCurrency).currencyId;
        const getBalance = async (address: string) => {
          const balance = await pendulum.api.query.tokens.accounts(address, currencyId);
          return new Big((balance as unknown as { free?: { toString(): string } }).free?.toString() ?? "0");
        };
        const current = await getBalance(substrateAddress);
        if (current.eq(0)) throw this.createRecoverableError("Input token did not arrive on Pendulum");
        const required = new Big(metadata.targetInputAmountRaw).minus(current);
        if (required.gt(0)) {
          const funding = getFundingAccount();
          const available = await getBalance(funding.address);
          if (available.lt(required)) throw this.createUnrecoverableError("Pendulum pre-swap funding balance too low");
          const result = await runFinancialOperation({
            attemptClass: "substrate-subsidy-transfer",
            externalId: operation => operation.hash,
            flow: requireFinancialFlowIdentity(state.state),
            perform: async () => {
              throwIfAborted(signal);
              const sent = await abortableCall(signal, () =>
                manager.executeApiCall(
                  api => api.tx.tokens.transfer(substrateAddress, currencyId, required.toFixed(0, 0)),
                  funding,
                  "pendulum"
                )
              );
              await waitUntilTrueWithTimeout(
                async () => (await getBalance(substrateAddress)).gte(metadata.targetInputAmountRaw),
                5000,
                180000,
                signal
              );
              return { hash: sent.hash };
            },
            phase: this.getPhaseName(),
            provider: Networks.Pendulum,
            request: {
              amountRaw: required.toFixed(0, 0),
              currencyId,
              destination: substrateAddress,
              source: funding.address
            },
            scopeId: state.id,
            scopeType: "ramp",
            signal
          });
          await this.createSubsidy(
            state,
            nativeToDecimal(required, metadata.inputDecimals).toNumber(),
            metadata.inputCurrency as SubsidyToken,
            funding.address,
            result.hash
          );
        }
        return state;
      } catch (e) {
        logger.error("Error in subsidizePreSwap (Pendulum):", e);
        if (e instanceof PhaseError) throw e;
        throw this.createRecoverableError("SubsidizePreSwapExecutor: Failed to subsidize pre swap on Pendulum.");
      }
    }

    const { evmEphemeralAddress } = state.state as StateMetadata;
    if (!evmEphemeralAddress) {
      throw new Error("SubsidizePreSwapExecutor: State metadata corrupted. This is a bug.");
    }

    try {
      const inputToken = metadata.inputCurrency as EvmToken;
      const inputNetwork = metadata.network as Networks;
      const inputTokenDetails = getOnChainTokenDetails(inputNetwork, inputToken) as EvmTokenDetails;
      if (!inputTokenDetails) {
        throw new Error(
          `Could not find token details for input token ${inputToken} on network ${inputNetwork}. Invalid quote metadata.`
        );
      }
      const expectedInputAmountForSwapRaw = metadata.targetInputAmountRaw;

      // Wait for token settlement before checking balance
      await sleep(EVM_SETTLEMENT_DELAY_MS, signal);

      const currentBalance = await checkEvmBalanceForToken({
        amountDesiredRaw: "1",
        chain: inputTokenDetails.network as EvmNetworks,
        intervalMs: 1000,
        ownerAddress: evmEphemeralAddress,
        signal,
        timeoutMs: 5000,
        tokenDetails: inputTokenDetails
      });

      if (currentBalance.eq(Big(0))) {
        throw new Error("Invalid phase: input token did not arrive yet on EVM");
      }

      const requiredAmount = Big(expectedInputAmountForSwapRaw).sub(currentBalance);
      logger.debug(`SubsidizePreSwapExecutor: requiredAmount ${requiredAmount.toString()}`);

      if (requiredAmount.gt(Big(0))) {
        const subsidyDecimal = nativeToDecimal(requiredAmount, metadata.inputDecimals).toString();
        const subsidyUsd = await priceFeedService.convertCurrency(
          subsidyDecimal,
          inputToken as RampCurrency,
          EvmToken.USDC as RampCurrency
        );
        const quoteOutputUsd = await priceFeedService.convertCurrency(
          quote.outputAmount,
          quote.outputCurrency as RampCurrency,
          EvmToken.USDC as RampCurrency
        );
        const subsidyCapFraction = config.subsidy.evmSwapSubsidyQuoteFraction;
        const percentageCap = Big(quoteOutputUsd).mul(subsidyCapFraction);
        const subsidyCapUsd = percentageCap.gt("1") ? percentageCap : Big("1");
        if (Big(subsidyUsd).gt(subsidyCapUsd)) {
          // Pause for operator intervention without moving the ramp to failed.
          throw this.createRecoverableError(
            `SubsidizePreSwapExecutor: Required subsidy $${subsidyUsd} exceeds cap $${subsidyCapUsd.toFixed(2)} (max of $1.00 and ${subsidyCapFraction} of quote output $${quoteOutputUsd}).`
          );
        }

        logger.info(
          `Subsidizing pre-swap EVM with ${requiredAmount.toFixed()} to reach target value of ${expectedInputAmountForSwapRaw}`
        );

        const evmClientManager = EvmClientManager.getInstance();
        const destinationNetwork = inputTokenDetails.network as EvmNetworks;
        const fundingAccount = getEvmFundingAccount(destinationNetwork);

        const publicClient = evmClientManager.getClient(destinationNetwork);
        const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();
        const nonce = await publicClient.getTransactionCount({ address: fundingAccount.address, blockTag: "pending" });

        const data = encodeFunctionData({
          abi: erc20Abi,
          args: [evmEphemeralAddress as `0x${string}`, BigInt(requiredAmount.toFixed(0))],
          functionName: "transfer"
        });

        const { hash: txHash } = await runFinancialOperation({
          attemptClass: "evm-subsidy-transfer",
          externalId: operation => operation.hash,
          flow: requireFinancialFlowIdentity(state.state),
          perform: async () => {
            throwIfAborted(signal);
            const hash = await evmClientManager.sendTransactionWithBlindRetry(destinationNetwork, fundingAccount, {
              data,
              maxFeePerGas,
              maxPriorityFeePerGas,
              nonce,
              to: inputTokenDetails.erc20AddressSourceChain as `0x${string}`,
              value: 0n
            });
            const receipt = await abortableCall(signal, () => publicClient.waitForTransactionReceipt({ hash }));
            if (receipt.status !== "success") {
              throw new Error(`SubsidizePreSwapExecutor: Subsidy transaction ${hash} failed`);
            }
            return { hash };
          },
          phase: this.getPhaseName(),
          provider: destinationNetwork,
          request: {
            amountRaw: requiredAmount.toFixed(0),
            destination: evmEphemeralAddress,
            network: destinationNetwork,
            nonce,
            source: fundingAccount.address,
            token: inputTokenDetails.erc20AddressSourceChain
          },
          scopeId: state.id,
          scopeType: "ramp",
          signal
        });

        const subsidyAmount = nativeToDecimal(requiredAmount, metadata.inputDecimals).toNumber();
        const subsidyToken = metadata.inputCurrency as unknown as SubsidyToken;

        await this.createSubsidy(state, subsidyAmount, subsidyToken, fundingAccount.address, txHash);
      }

      return state;
    } catch (e) {
      logger.error("Error in subsidizePreSwap (EVM):", e);
      if (e instanceof PhaseError) {
        throw e;
      }
      if (e instanceof FinancialOperationReconciliationRequiredError) {
        throw this.createRecoverableError(e.message);
      }
      throw this.createRecoverableError("SubsidizePreSwapExecutor: Failed to subsidize pre swap on EVM.");
    }
  }
}
