import {
  ApiManager,
  decodeSubmittableExtrinsic,
  FiatToken,
  getAddressForFormat,
  getAnyFiatTokenDetailsMoonbeam,
  getEvmTokenBalance,
  MOONBEAM_XCM_FEE_GLMR,
  Networks,
  nativeToDecimal,
  RampPhase,
  sleep,
  submitXTokens
} from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../../../../config/logger";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { SubsidyToken } from "../../../../../../models/subsidy.model";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { abortableCall, throwIfAborted } from "../../core/cancellation";
import { getBlockMetadata, getBlockState } from "../../core/metadata";
import type { AveniaOfframpPayoutRegistrationFacts } from "../avenia-offramp-payout/registration";
import { AveniaPendulumOfframpContext } from "./simulation";

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 2 * 60_000;

export class PendulumToAveniaXcmExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "pendulumToMoonbeamXcm";
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) throw new Error("PendulumToAveniaXcmExecutor: quote not found");
    const metadata = getBlockMetadata(quote.metadata, AveniaPendulumOfframpContext);
    const facts = getBlockState<AveniaOfframpPayoutRegistrationFacts>(state.state, AveniaPendulumOfframpContext);
    const substrateAddress = state.state.substrateEphemeralAddress;
    if (!substrateAddress) throw new Error("PendulumToAveniaXcmExecutor: missing Substrate ephemeral");
    const pendulum = await ApiManager.getInstance().getApi("pendulum");
    const arrived = async () =>
      (
        await getEvmTokenBalance({
          chain: Networks.Moonbeam,
          ownerAddress: facts.brlaEvmAddress as `0x${string}`,
          tokenAddress: getAnyFiatTokenDetailsMoonbeam(FiatToken.BRL).moonbeamErc20Address as `0x${string}`
        })
      ).gte(metadata.transferAmountRaw);
    const leftPendulum = async () => {
      const balance = await pendulum.api.query.tokens.accounts(substrateAddress, metadata.pendulumCurrencyId);
      return new Big((balance as unknown as { free?: { toString(): string } }).free?.toString() ?? "0").lt(
        metadata.transferAmountRaw
      );
    };
    try {
      let submittedHash: string | undefined;
      if (!state.state.pendulumToMoonbeamXcmHash && !(await leftPendulum())) {
        throwIfAborted(signal);
        const presigned = this.getPresignedTransaction(state, this.getPhaseName());
        const extrinsic = decodeSubmittableExtrinsic(presigned.txData as string, pendulum.api);
        const { hash } = await this.runFinancialOperation(state, {
          attemptClass: "pendulum-moonbeam-xcm-broadcast",
          externalId: result => result.hash,
          perform: async () => {
            throwIfAborted(signal);
            return abortableCall(signal, () =>
              submitXTokens(getAddressForFormat(substrateAddress, pendulum.ss58Format), extrinsic)
            );
          },
          provider: "pendulum",
          request: { network: "pendulum", signedTransaction: presigned.txData },
          signal
        });
        submittedHash = hash;
        state.state = { ...state.state, pendulumToMoonbeamXcmHash: hash };
        await state.update({ state: state.state });
      }
      const started = Date.now();
      while (Date.now() - started < POLL_TIMEOUT_MS) {
        throwIfAborted(signal);
        if (await abortableCall(signal, arrived)) {
          if (submittedHash !== undefined) {
            await this.createSubsidy(
              state,
              nativeToDecimal(MOONBEAM_XCM_FEE_GLMR, 18).toNumber(),
              SubsidyToken.GLMR,
              substrateAddress,
              submittedHash || "0x"
            );
          }
          return state;
        }
        await sleep(POLL_INTERVAL_MS, signal);
      }
      throw this.createRecoverableError("PendulumToAveniaXcmExecutor: timed out waiting for Moonbeam arrival");
    } catch (error) {
      logger.error("PendulumToAveniaXcmExecutor failed", error);
      if (error instanceof Error && "isRecoverable" in error) throw error;
      throw this.createRecoverableError("PendulumToAveniaXcmExecutor failed");
    }
  }
}
