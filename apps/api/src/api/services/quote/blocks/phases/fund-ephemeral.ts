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
import { type Hex, parseTransaction } from "viem";
import logger from "../../../../../config/logger";
import {
  BASE_EPHEMERAL_STARTING_BALANCE_UNITS,
  POLYGON_EPHEMERAL_STARTING_BALANCE_UNITS
} from "../../../../../constants/constants";
import RampState from "../../../../../models/rampState.model";
import { UnrecoverablePhaseError } from "../../../../errors/phase-error";
import { BasePhaseHandler } from "../../../phases/base-phase-handler";
import { getEvmFundingAccount } from "../../../phases/evm-funding";
import {
  DESTINATION_EVM_FUNDING_AMOUNTS,
  isBaseEphemeralFunded,
  isDestinationEvmEphemeralFunded,
  isPolygonEphemeralFunded
} from "../../../phases/handlers/helpers";
import { StateMetadata } from "../../../phases/meta-state-types";
import type { ChainBrand, Phase, PhaseCtx, PhaseIO, TokenBrand } from "../core/types";

// EVM-ephemeral onramp slice of the production FundEphemeralPhaseHandler: funds the source-chain
// ephemeral (native gas + the presigned squidRouter swap value) and, for BUY ramps to an EVM
// destination, the destination-chain ephemeral. Substrate/Polygon-Alfredpay branches are not ported.
class FundEphemeralExecutor extends BasePhaseHandler {
  constructor(private readonly chain: EvmNetworks) {
    super();
  }

  public getPhaseName(): RampPhase {
    return "fundEphemeral";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const { evmEphemeralAddress } = state.state as StateMetadata;
    if (!evmEphemeralAddress) {
      throw new Error("FundEphemeralExecutor: State metadata corrupted, missing evmEphemeralAddress. This is a bug.");
    }

    try {
      const isSourceFunded =
        this.chain === Networks.Polygon
          ? await isPolygonEphemeralFunded(evmEphemeralAddress)
          : await isBaseEphemeralFunded(evmEphemeralAddress);

      if (!isSourceFunded) {
        logger.info(`Funding ${this.chain} ephemeral account ${evmEphemeralAddress}`);
        await this.fundEvmEphemeralAccount(state, this.chain);
      } else {
        logger.info(`${this.chain} ephemeral address already funded.`);
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

  protected async fundEvmEphemeralAccount(state: RampState, network: EvmNetworks): Promise<void> {
    try {
      const evmClientManager = EvmClientManager.getInstance();
      const networkClient = evmClientManager.getClient(network);
      const chain = networkClient.chain;

      if (!chain) {
        throw new Error(`FundEphemeralExecutor: Could not get chain info for ${network}`);
      }

      const amountToFundUnits =
        network === Networks.Polygon ? POLYGON_EPHEMERAL_STARTING_BALANCE_UNITS : BASE_EPHEMERAL_STARTING_BALANCE_UNITS;

      const ephemeralAddress = state.state.evmEphemeralAddress;
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
            `FundEphemeralExecutor: Could not decode squidRouterSwap presigned tx for value extraction on ${network}: ${decodeError}`
          );
        }
      }

      const fundingAmountRaw = (baseFundingRaw + swapValueRaw).toString();

      const fundingAccount = getEvmFundingAccount(network);
      const walletClient = evmClientManager.getWalletClient(network, fundingAccount);

      const txHash = await walletClient.sendTransaction({
        to: ephemeralAddress as `0x${string}`,
        value: BigInt(fundingAmountRaw)
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
      const isFundedCheck =
        network === Networks.Polygon
          ? () => isPolygonEphemeralFunded(ephemeralAddress)
          : () => isBaseEphemeralFunded(ephemeralAddress);

      try {
        await waitUntilTrueWithTimeout(isFundedCheck, 1000, 30000);
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

export function FundEphemeral<Token extends TokenBrand, Chain extends ChainBrand>(
  _token: Token,
  chain: Chain
): Phase<PhaseIO<Token, Chain>, PhaseIO<Token, Chain>> {
  return {
    executors: [new FundEphemeralExecutor(chain as EvmNetworks)],
    name: "FundEphemeral",
    phases: ["fundEphemeral"],
    async simulate(input: PhaseIO<Token, Chain>, ctx: PhaseCtx): Promise<PhaseIO<Token, Chain>> {
      ctx.addNote(`FundEphemeral: funding ephemeral on ${input.chain} for ${input.amount.toFixed()} ${input.token}`);
      return input;
    }
  };
}
