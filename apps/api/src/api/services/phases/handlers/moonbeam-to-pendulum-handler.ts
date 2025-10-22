import { ApiManager, EvmClientManager, encodePayload, Networks, RampPhase, waitUntilTrue } from "@packages/shared";
import splitReceiverABI from "@packages/shared/src/contracts/moonbeam/splitReceiverABI.json";
import { u8aToHex } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto";
import Big from "big.js";
import { encodeFunctionData, TransactionReceipt } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import logger from "../../../../config/logger";
import { MOONBEAM_EXECUTOR_PRIVATE_KEY, MOONBEAM_RECEIVER_CONTRACT_ADDRESS } from "../../../../constants/constants";
import QuoteTicket from "../../../../models/quoteTicket.model";
import RampState from "../../../../models/rampState.model";
import { BasePhaseHandler } from "../base-phase-handler";
import { StateMetadata } from "../meta-state-types";

export class MoonbeamToPendulumPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "moonbeamToPendulum";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    const apiManager = ApiManager.getInstance();
    const pendulumNode = await apiManager.getApi("pendulum");

    const { substrateEphemeralAddress, moonbeamXcmTransactionHash, squidRouterReceiverId, squidRouterReceiverHash } =
      state.state as StateMetadata;

    if (!substrateEphemeralAddress || !squidRouterReceiverId || !squidRouterReceiverId || !squidRouterReceiverHash) {
      throw new Error("MoonbeamToPendulumPhaseHandler: State metadata corrupted. This is a bug.");
    }

    const pendulumEphemeralAccountHex = u8aToHex(decodeAddress(substrateEphemeralAddress));
    const squidRouterPayload = encodePayload(pendulumEphemeralAccountHex);

    const didInputTokenArrivedOnPendulum = async () => {
      if (!quote.metadata.nablaSwap) {
        throw new Error("MoonbeamToPendulumXcmPhaseHandler: Missing nablaSwap info in quote metadata");
      }

      const balanceResponse = await pendulumNode.api.query.tokens.accounts(
        substrateEphemeralAddress,
        quote.metadata.nablaSwap.inputCurrencyId
      );

      // @ts-ignore
      const currentBalance = Big(balanceResponse?.free?.toString() ?? "0");
      return currentBalance.gt(Big(0));
    };

    const moonbeamExecutorAccount = privateKeyToAccount(MOONBEAM_EXECUTOR_PRIVATE_KEY as `0x${string}`);
    const evmClientManager = EvmClientManager.getInstance();
    const publicClient = evmClientManager.getClient(Networks.Moonbeam);

    const isHashRegisteredInSplitReceiver = async () => {
      const result = await evmClientManager.readContractWithRetry<bigint>(Networks.Moonbeam, {
        abi: splitReceiverABI,
        address: MOONBEAM_RECEIVER_CONTRACT_ADDRESS,
        args: [squidRouterReceiverHash],
        functionName: "xcmDataMapping"
      });

      return result > 0n;
    };

    try {
      if (!(await didInputTokenArrivedOnPendulum())) {
        await waitUntilTrue(isHashRegisteredInSplitReceiver);
        console.log(`Hash ${squidRouterReceiverHash} is registered in receiver contract`);
      }
    } catch (e) {
      logger.error(e);
      throw new Error("MoonbeamToPendulumPhaseHandler: Failed to wait for hash registration in split receiver.");
    }

    let obtainedHash: `0x${string}` | undefined = moonbeamXcmTransactionHash;
    try {
      if (!(await didInputTokenArrivedOnPendulum())) {
        if (moonbeamXcmTransactionHash === undefined) {
          const data = encodeFunctionData({
            abi: splitReceiverABI,
            args: [squidRouterReceiverId, squidRouterPayload],
            functionName: "executeXCM"
          });

          const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

          let receipt: TransactionReceipt | undefined = undefined;
          let attempt = 0;
          while (attempt < 5 && (!receipt || receipt.status !== "success")) {
            // blind retry for transaction submission
            obtainedHash = await evmClientManager.sendTransactionWithBlindRetry(Networks.Moonbeam, moonbeamExecutorAccount, {
              data,
              maxFeePerGas,
              maxPriorityFeePerGas,
              to: MOONBEAM_RECEIVER_CONTRACT_ADDRESS,
              value: 0n
            });

            receipt = await publicClient.waitForTransactionReceipt({ hash: obtainedHash });
            if (!receipt || receipt.status !== "success") {
              logger.error(`MoonbeamToPendulumPhaseHandler: Transaction ${obtainedHash} failed or was not found`);
              attempt++;
              // Wait for 20 seconds to allow the network to settle the squidrouter transaction
              await new Promise(resolve => setTimeout(resolve, 20000));
            }
          }

          // We want to store the `moonbeamXcmTransactionHash` immediately in the local storage
          // and not just after this function call here would usually end (i.e. after the
          // tokens arrived on Pendulum).
          // For recovery purposes.
          state.state = {
            ...state.state,
            moonbeamXcmTransactionHash: obtainedHash
          };
          await state.update({ state: state.state });
        }
      }
    } catch (e) {
      console.error("Error while executing moonbeam split contract transaction:", e);
      throw new Error("MoonbeamToPendulumPhaseHandler: Failed to send XCM transaction");
    }

    try {
      await waitUntilTrue(didInputTokenArrivedOnPendulum, 5000);
    } catch (e) {
      console.error("Error while waiting for transaction receipt:", e);
      throw new Error("MoonbeamToPendulumPhaseHandler: Failed to wait for tokens to arrive on Pendulum.");
    }

    return this.transitionToNextPhase(state, this.nextPhaseSelector(state));
  }

  private nextPhaseSelector(state: RampState): RampPhase {
    if (state.type === "BUY") {
      return "subsidizePreSwap";
    } else {
      return "distributeFees";
    }
  }
}

export default new MoonbeamToPendulumPhaseHandler();
