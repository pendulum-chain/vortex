import {
  EvmClientManager,
  EvmNetworks,
  getNetworkFromDestination,
  isNetworkEVM,
  multiplyByPowerOfTen,
  Networks,
  RampDirection,
  RampPhase,
  waitUntilTrueWithTimeout
} from "@vortexfi/shared";
import logger from "../../../../../../config/logger";
import {
  BASE_EPHEMERAL_STARTING_BALANCE_UNITS,
  POLYGON_EPHEMERAL_STARTING_BALANCE_UNITS
} from "../../../../../../constants/constants";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { UnrecoverablePhaseError } from "../../../../../errors/phase-error";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { getEvmFundingAccount } from "../../../../phases/evm-funding";
import { DESTINATION_EVM_FUNDING_AMOUNTS, isDestinationEvmEphemeralFunded } from "../../../../phases/handlers/helpers";
import { StateMetadata } from "../../../../phases/meta-state-types";
import { getBlockMetadata } from "../../core/metadata";
import { getNativePrefunding } from "../../core/prepare";
import { FundEphemeralContext } from "./simulation";

export class FundEphemeralExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "fundEphemeral";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const { evmEphemeralAddress } = state.state as StateMetadata;
    if (!evmEphemeralAddress) {
      throw new Error("FundEphemeralExecutor: State metadata corrupted, missing evmEphemeralAddress. This is a bug.");
    }

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }
    const metadata = getBlockMetadata(quote.metadata, FundEphemeralContext);
    const sourceNetwork = metadata.network as EvmNetworks;

    try {
      const sourceClient = EvmClientManager.getInstance().getClient(sourceNetwork);
      const chain = sourceClient.chain;
      if (!chain) {
        throw new Error(`FundEphemeralExecutor: Could not get chain info for ${sourceNetwork}`);
      }
      const fixedFundingUnits =
        sourceNetwork === Networks.Polygon ? POLYGON_EPHEMERAL_STARTING_BALANCE_UNITS : BASE_EPHEMERAL_STARTING_BALANCE_UNITS;
      const fixedFundingRaw = BigInt(multiplyByPowerOfTen(fixedFundingUnits, chain.nativeCurrency.decimals).toFixed());
      const plannedNativeValueRaw = getNativePrefunding(state.state.transactionPlan, sourceNetwork, evmEphemeralAddress);
      const requiredFundingRaw = fixedFundingRaw + plannedNativeValueRaw;
      const currentBalanceRaw = await sourceClient.getBalance({ address: evmEphemeralAddress as `0x${string}` });

      if (currentBalanceRaw < requiredFundingRaw) {
        logger.info(`Funding ${sourceNetwork} ephemeral account ${evmEphemeralAddress}`);
        await this.fundEvmEphemeralAccount(state, sourceNetwork, requiredFundingRaw - currentBalanceRaw, requiredFundingRaw);
      } else {
        logger.info(`${sourceNetwork} ephemeral address already funded.`);
      }

      const destinationNetwork = getNetworkFromDestination(state.to);
      if (
        state.type === RampDirection.BUY &&
        state.to !== Networks.AssetHub &&
        destinationNetwork &&
        isNetworkEVM(destinationNetwork)
      ) {
        const isFunded = await isDestinationEvmEphemeralFunded(evmEphemeralAddress, destinationNetwork);
        if (!isFunded) {
          logger.info(`Funding EVM ephemeral account ${evmEphemeralAddress} on ${destinationNetwork}`);
          await this.fundDestinationEvmEphemeralAccount(state, destinationNetwork);
        } else {
          logger.info(`EVM ephemeral account already funded on ${destinationNetwork}.`);
        }
      }
    } catch (e) {
      logger.error("Error in FundEphemeralExecutor:", e);

      if (e instanceof UnrecoverablePhaseError) {
        throw e;
      }

      throw this.createRecoverableError("Error funding ephemeral account");
    }

    return state;
  }

  protected async fundEvmEphemeralAccount(
    state: RampState,
    network: EvmNetworks,
    fundingAmountRaw: bigint,
    requiredFundingRaw: bigint
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

      const txHash = await walletClient.sendTransaction({
        to: ephemeralAddress as `0x${string}`,
        value: fundingAmountRaw
      });

      const receipt = await networkClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`
      });

      if (!receipt || receipt.status !== "success") {
        throw new Error(`FundEphemeralExecutor: Transaction ${txHash} failed or was not found`);
      }

      // The receipt confirms inclusion, but downstream phases use a different RPC client which
      // may briefly lag behind. Poll the balance until it reflects the funded amount so that
      // subsequent phases (nablaApprove etc.) don't read a stale balance.
      try {
        await waitUntilTrueWithTimeout(
          async () => (await networkClient.getBalance({ address: ephemeralAddress as `0x${string}` })) >= requiredFundingRaw,
          1000,
          30000
        );
      } catch (pollError) {
        throw new Error(
          `FundEphemeralExecutor: Funded ${ephemeralAddress} on ${network} but balance not reflected on RPC within timeout: ${pollError}`
        );
      }
    } catch (error) {
      logger.error(`FundEphemeralExecutor: Error during funding ${network} ephemeral:`, error);
      throw new Error(`FundEphemeralExecutor: Error during funding ${network} ephemeral: ` + error);
    }
  }

  protected async fundDestinationEvmEphemeralAccount(state: RampState, destinationNetwork: EvmNetworks): Promise<void> {
    try {
      const evmClientManager = EvmClientManager.getInstance();
      const destinationClient = evmClientManager.getClient(destinationNetwork);
      const chain = destinationClient.chain;

      if (!chain) {
        throw new Error(`FundEphemeralExecutor: Could not get chain info for ${destinationNetwork}`);
      }

      const ephemeralAddress = state.state.evmEphemeralAddress;
      const fundingAmountUnits = DESTINATION_EVM_FUNDING_AMOUNTS[destinationNetwork];
      const fundingAmountRaw = multiplyByPowerOfTen(fundingAmountUnits, chain.nativeCurrency.decimals).toFixed();

      const fundingAccount = getEvmFundingAccount(destinationNetwork);
      const walletClient = evmClientManager.getWalletClient(destinationNetwork, fundingAccount);

      const txHash = await walletClient.sendTransaction({
        to: ephemeralAddress as `0x${string}`,
        value: BigInt(fundingAmountRaw)
      });

      const receipt = await destinationClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`
      });

      if (!receipt || receipt.status !== "success") {
        throw new Error(`FundEphemeralExecutor: Transaction ${txHash} failed or was not found on ${destinationNetwork}`);
      }

      try {
        await waitUntilTrueWithTimeout(
          () => isDestinationEvmEphemeralFunded(ephemeralAddress, destinationNetwork),
          1000,
          30000
        );
      } catch (pollError) {
        throw new Error(
          `FundEphemeralExecutor: Funded ${ephemeralAddress} on ${destinationNetwork} but balance not reflected on RPC within timeout: ${pollError}`
        );
      }
    } catch (error) {
      logger.error(`FundEphemeralExecutor: Error during funding ${destinationNetwork} ephemeral:`, error);
      throw new Error(`FundEphemeralExecutor: Error during funding ${destinationNetwork} ephemeral: ` + error);
    }
  }
}
