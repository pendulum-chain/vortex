import {
  ApiManager,
  EvmClientManager,
  EvmNetworks,
  FiatToken,
  getNetworkFromDestination,
  isAlfredpayToken,
  isNetworkEVM,
  Networks,
  RampDirection,
  RampPhase,
  waitUntilTrueWithTimeout
} from "@vortexfi/shared";
import { type Hex, parseTransaction } from "viem";
import logger from "../../../../config/logger";
import {
  BASE_EPHEMERAL_STARTING_BALANCE_UNITS,
  POLYGON_EPHEMERAL_STARTING_BALANCE_UNITS
} from "../../../../constants/constants";

import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { UnrecoverablePhaseError } from "../../../errors/phase-error";
import { multiplyByPowerOfTen } from "../../pendulum/helpers";
import { fundEphemeralAccount } from "../../pendulum/pendulum.service";
import { BasePhaseHandler } from "../base-phase-handler";
import { getEvmFundingAccount } from "../evm-funding";
import { verifyUserSubmittedTxByHash } from "../helpers/user-tx-verifier";
import { StateMetadata } from "../meta-state-types";
import {
  DESTINATION_EVM_FUNDING_AMOUNTS,
  isBaseEphemeralFunded,
  isDestinationEvmEphemeralFunded,
  isPendulumEphemeralFunded,
  isPolygonEphemeralFunded
} from "./helpers";

function isOnramp(state: RampState): boolean {
  return state.type === RampDirection.BUY;
}

export class FundEphemeralPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "fundEphemeral";
  }

  protected getRequiresPendulumEphemeralAddress(state: RampState, inputCurrency?: string, outputCurrency?: string): boolean {
    // Pendulum ephemeral address is required for all cases except when doing a Mykobo (EUR) onramp to EVM,
    // an Alfredpay onramp to EVM, or an Alfredpay offramp.
    if (
      isOnramp(state) &&
      (inputCurrency === FiatToken.EURC || isAlfredpayToken(inputCurrency as FiatToken)) &&
      state.to !== Networks.AssetHub
    ) {
      return false;
    }

    if (!isOnramp(state) && isAlfredpayToken(outputCurrency as FiatToken)) {
      return false;
    }

    if (inputCurrency === FiatToken.BRL || outputCurrency === FiatToken.BRL) {
      return false;
    }
    return true;
  }

  protected getRequiresPolygonEphemeralAddress(state: RampState, inputCurrency?: string, outputCurrency?: string): boolean {
    // Only required for Alfredpay onramps and offramps. Mykobo (EUR) runs on Base, not Polygon.
    if (isOnramp(state) && isAlfredpayToken(inputCurrency as FiatToken)) {
      return true;
    }
    if (!isOnramp(state) && isAlfredpayToken(outputCurrency as FiatToken)) {
      return true;
    }

    return false;
  }

  protected getRequiresBaseEphemeralAddress(inputCurrency?: string, outputCurrency?: string): boolean {
    if (inputCurrency === FiatToken.BRL || outputCurrency === FiatToken.BRL) {
      return true;
    }
    if (inputCurrency === FiatToken.EURC || outputCurrency === FiatToken.EURC) {
      return true;
    }
    return false;
  }

  protected getRequiresDestinationEvmFunding(state: RampState): boolean {
    // Required for onramps where the destination is an EVM network (not AssetHub)
    if (isOnramp(state) && state.to !== Networks.AssetHub) {
      const destinationNetwork = getNetworkFromDestination(state.to);
      if (destinationNetwork && isNetworkEVM(destinationNetwork)) {
        return true;
      }
    }
    return false;
  }

  // SELL ramps where the user broadcasts squidRouterApprove + squidRouterSwap from their own
  // wallet only report tx hashes back via /v1/ramp/update. Before we spend ephemeral gas funding
  // the downstream phases, we must confirm on-chain that those hashes correspond to txs matching
  // the blueprint we issued — otherwise an integrator could point us at any tx and have us fund
  // ephemerals based on a tx that does not actually deliver tokens to our ephemeral.
  private async verifyUserSubmittedSquidHashes(state: RampState, quote: QuoteTicket): Promise<void> {
    if (state.type !== RampDirection.SELL) return;
    if (state.from === Networks.AssetHub) return;
    if (isAlfredpayToken(quote.outputCurrency as FiatToken)) return;

    const fromNetwork = state.from as EvmNetworks;
    if (!isNetworkEVM(fromNetwork)) return;

    // Base+USDC direct path: the user broadcasts a single ERC20 transfer instead of squid
    // approve+swap. Verify that hash before we fund the ephemeral and spend gas on Nabla.
    const hasNoPermitTransferBlueprint = state.unsignedTxs.some(tx => tx.phase === "squidRouterNoPermitTransfer");
    if (hasNoPermitTransferBlueprint) {
      await verifyUserSubmittedTxByHash({
        fromNetwork,
        hash: state.state.squidRouterNoPermitTransferHash as `0x${string}` | undefined,
        label: "User direct USDC transfer to ephemeral",
        presignedPhase: "squidRouterNoPermitTransfer",
        state
      });
      return;
    }

    const hasSquidApproveBlueprint = state.unsignedTxs.some(tx => tx.phase === "squidRouterApprove");
    if (!hasSquidApproveBlueprint) return;

    await verifyUserSubmittedTxByHash({
      fromNetwork,
      hash: state.state.squidRouterApproveHash as `0x${string}` | undefined,
      label: "User squidRouter approve",
      presignedPhase: "squidRouterApprove",
      state
    });
    await verifyUserSubmittedTxByHash({
      fromNetwork,
      hash: state.state.squidRouterSwapHash as `0x${string}` | undefined,
      label: "User squidRouter swap",
      presignedPhase: "squidRouterSwap",
      state
    });
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    await this.verifyUserSubmittedSquidHashes(state, quote);

    const apiManager = ApiManager.getInstance();
    const pendulumNode = await apiManager.getApi("pendulum");

    const { evmEphemeralAddress, substrateEphemeralAddress } = state.state as StateMetadata;
    const requiresPendulumEphemeralAddress = this.getRequiresPendulumEphemeralAddress(
      state,
      quote.inputCurrency,
      quote.outputCurrency
    );
    const requiresPolygonEphemeralAddress = this.getRequiresPolygonEphemeralAddress(
      state,
      quote.inputCurrency,
      quote.outputCurrency
    );
    const requiresBaseEphemeralAddress = this.getRequiresBaseEphemeralAddress(quote.inputCurrency, quote.outputCurrency);
    const requiresDestinationEvmFunding = this.getRequiresDestinationEvmFunding(state);

    // Ephemeral checks.
    if (!substrateEphemeralAddress && requiresPendulumEphemeralAddress) {
      throw new Error("FundEphemeralPhaseHandler: State metadata corrupted, missing substrateEphemeralAddress. This is a bug.");
    }
    if (isOnramp(state) && quote.inputCurrency === FiatToken.BRL && !evmEphemeralAddress) {
      throw new Error("FundEphemeralPhaseHandler: State metadata corrupted, missing evmEphemeralAddress. This is a bug.");
    }
    if (isOnramp(state) && quote.inputCurrency === FiatToken.EURC && !evmEphemeralAddress) {
      throw new Error("FundEphemeralPhaseHandler: State metadata corrupted, missing evmEphemeralAddress. This is a bug.");
    }

    try {
      const isPendulumFunded = requiresPendulumEphemeralAddress
        ? await isPendulumEphemeralFunded(substrateEphemeralAddress, pendulumNode)
        : true;

      const isBaseFunded = requiresBaseEphemeralAddress ? await isBaseEphemeralFunded(evmEphemeralAddress) : true;

      const isPolygonFunded = requiresPolygonEphemeralAddress ? await isPolygonEphemeralFunded(evmEphemeralAddress) : true;

      const destinationNetwork = getNetworkFromDestination(state.to);
      const isDestinationEvmFunded =
        requiresDestinationEvmFunding && destinationNetwork && isNetworkEVM(destinationNetwork) // for type safety
          ? await isDestinationEvmEphemeralFunded(evmEphemeralAddress, destinationNetwork)
          : true;

      if (!isPendulumFunded) {
        logger.info(`Funding PEN ephemeral account ${substrateEphemeralAddress}`);
        if (isOnramp(state) && state.to !== Networks.AssetHub) {
          await fundEphemeralAccount("pendulum", substrateEphemeralAddress, true);
        } else if (quote.outputCurrency === FiatToken.BRL) {
          await fundEphemeralAccount("pendulum", substrateEphemeralAddress, true);
        } else {
          await fundEphemeralAccount("pendulum", substrateEphemeralAddress, false);
        }
      } else if (requiresPendulumEphemeralAddress) {
        logger.info("Pendulum ephemeral address already funded.");
      }

      if (!isBaseFunded) {
        logger.info(`Funding base ephemeral account ${evmEphemeralAddress}`);
        await this.fundEvmEphemeralAccount(state, Networks.Base);
      }

      if (!isPolygonFunded) {
        logger.info(`Funding polygon ephemeral account ${evmEphemeralAddress}`);
        await this.fundEvmEphemeralAccount(state, Networks.Polygon);
      } else if (requiresPolygonEphemeralAddress) {
        logger.info("Polygon ephemeral address already funded.");
      }

      if (isOnramp(state) && !isDestinationEvmFunded && destinationNetwork && isNetworkEVM(destinationNetwork)) {
        logger.info(`Funding destination EVM ephemeral account ${evmEphemeralAddress} on ${destinationNetwork}`);
        await this.fundDestinationEvmEphemeralAccount(state, destinationNetwork);
      } else if (requiresDestinationEvmFunding) {
        logger.info(`Destination EVM ephemeral address already funded on ${destinationNetwork}.`);
      }
    } catch (e) {
      logger.error("Error in FundEphemeralPhaseHandler:", e);

      // Preserve UnrecoverablePhaseError
      if (e instanceof UnrecoverablePhaseError) {
        throw e;
      }

      const recoverableError = this.createRecoverableError("Error funding ephemeral account");
      throw recoverableError;
    }

    return this.transitionToNextPhase(state, this.nextPhaseSelector(state, quote));
  }

  protected nextPhaseSelector(state: RampState, quote: QuoteTicket): RampPhase {
    // brla onramp case
    if (isOnramp(state) && quote.inputCurrency === FiatToken.BRL) {
      return "subsidizePreSwap";
    }
    // mykobo (EURC) onramp case
    if (isOnramp(state) && quote.inputCurrency === FiatToken.EURC) {
      return "subsidizePreSwap";
    }
    // alfredpay onramp case
    if (isOnramp(state) && isAlfredpayToken(quote.inputCurrency as FiatToken)) {
      return "squidRouterSwap";
    }

    // off ramp cases
    if (state.type === RampDirection.SELL && state.from === Networks.AssetHub) {
      return "distributeFees";
    } else if (state.type === RampDirection.SELL && isAlfredpayToken(quote.outputCurrency as FiatToken)) {
      return "finalSettlementSubsidy";
    } else if (state.type === RampDirection.SELL && quote.outputCurrency === FiatToken.BRL) {
      return "distributeFees";
    } else if (state.type === RampDirection.SELL && quote.outputCurrency === FiatToken.EURC) {
      return "distributeFees";
    } else {
      return "moonbeamToPendulum"; // Via contract.subsidizePreSwap
    }
  }

  protected async fundEvmEphemeralAccount(state: RampState, network: EvmNetworks): Promise<void> {
    try {
      const evmClientManager = EvmClientManager.getInstance();
      const networkClient = evmClientManager.getClient(network);
      const chain = networkClient.chain;

      if (!chain) {
        throw new Error(`FundEphemeralPhaseHandler: Could not get chain info for ${network}`);
      }

      const amountToFundUnits =
        network === Networks.Polygon ? POLYGON_EPHEMERAL_STARTING_BALANCE_UNITS : BASE_EPHEMERAL_STARTING_BALANCE_UNITS;

      const ephmeralAddress = state.state.evmEphemeralAddress;
      const baseFundingRaw = BigInt(multiplyByPowerOfTen(amountToFundUnits, chain.nativeCurrency.decimals).toFixed());

      // Cover the exact native value the presigned squidRouter swap will send (bridge gas etc.).
      // The value already includes a safety margin from computeSwapValueWithSafetyMargin.
      // squidRouterPay remains as a top-up safety net if the route value still falls short.
      const swapTx = this.getPresignedTransaction(state, "squidRouterSwap");
      let swapValueRaw = 0n;
      if (swapTx?.txData && typeof swapTx.txData === "string") {
        try {
          swapValueRaw = parseTransaction(swapTx.txData as Hex).value ?? 0n;
        } catch (decodeError) {
          logger.warn(
            `FundEphemeralPhaseHandler: Could not decode squidRouterSwap presigned tx for value extraction on ${network}: ${decodeError}`
          );
        }
      }

      const fundingAmountRaw = (baseFundingRaw + swapValueRaw).toString();

      // We use Moonbeam's funding account to fund the ephemeral account on the network.
      const fundingAccount = getEvmFundingAccount(network);
      const walletClient = evmClientManager.getWalletClient(network, fundingAccount);

      const txHash = await walletClient.sendTransaction({
        to: ephmeralAddress as `0x${string}`,
        value: BigInt(fundingAmountRaw)
      });

      const receipt = await networkClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`
      });

      if (!receipt || receipt.status !== "success") {
        throw new Error(`FundEphemeralPhaseHandler: Transaction ${txHash} failed or was not found`);
      }

      // The receipt confirms inclusion, but downstream phases use a different RPC client which
      // may briefly lag behind. Poll the balance until it reflects the funded amount so that
      // subsequent phases (nablaApprove etc.) don't read a stale balance.
      const isFundedCheck =
        network === Networks.Polygon
          ? () => isPolygonEphemeralFunded(ephmeralAddress)
          : () => isBaseEphemeralFunded(ephmeralAddress);

      try {
        await waitUntilTrueWithTimeout(isFundedCheck, 1000, 30000);
      } catch (pollError) {
        throw new Error(
          `FundEphemeralPhaseHandler: Funded ${ephmeralAddress} on ${network} but balance not reflected on RPC within timeout: ${pollError}`
        );
      }
    } catch (error) {
      logger.error(`FundEphemeralPhaseHandler: Error during funding ${network} ephemeral:`, error);
      throw new Error(`FundEphemeralPhaseHandler: Error during funding ${network} ephemeral: ` + error);
    }
  }

  protected async fundDestinationEvmEphemeralAccount(state: RampState, destinationNetwork: EvmNetworks): Promise<void> {
    try {
      const evmClientManager = EvmClientManager.getInstance();
      const destinationClient = evmClientManager.getClient(destinationNetwork);
      const chain = destinationClient.chain;

      if (!chain) {
        throw new Error(`FundEphemeralPhaseHandler: Could not get chain info for ${destinationNetwork}`);
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
        throw new Error(`FundEphemeralPhaseHandler: Transaction ${txHash} failed or was not found on ${destinationNetwork}`);
      }

      try {
        await waitUntilTrueWithTimeout(
          () => isDestinationEvmEphemeralFunded(ephemeralAddress, destinationNetwork),
          1000,
          30000
        );
      } catch (pollError) {
        throw new Error(
          `FundEphemeralPhaseHandler: Funded ${ephemeralAddress} on ${destinationNetwork} but balance not reflected on RPC within timeout: ${pollError}`
        );
      }
    } catch (error) {
      logger.error(`FundEphemeralPhaseHandler: Error during funding ${destinationNetwork} ephemeral:`, error);
      throw new Error(`FundEphemeralPhaseHandler: Error during funding ${destinationNetwork} ephemeral: ` + error);
    }
  }
}

export default new FundEphemeralPhaseHandler();
