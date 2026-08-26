import { BalanceCheckError, checkEvmBalancePeriodically, type RampPhase } from "@vortexfi/shared";
import Big from "big.js";
import { isAddress } from "viem";
import type RampState from "../../../../../../models/rampState.model";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { getBlockState } from "../../core/metadata";
import type { MoneriumIssueRegistrationFacts } from "./registration";
import { MONERIUM_EURE, MONERIUM_ISSUE_NETWORKS, MoneriumIssueContext } from "./simulation";

const POLL_INTERVAL_MS = 5000;
const BALANCE_CHECK_TIMEOUT_MS = 5 * 60 * 1000;
const RAW_INTEGER_PATTERN = /^(?:0|[1-9]\d*)$/;

export class MoneriumOnrampMintExecutor extends BasePhaseHandler {
  constructor(private readonly waitForBalance: typeof checkEvmBalancePeriodically = checkEvmBalancePeriodically) {
    super();
  }

  public getPhaseName(): RampPhase {
    return "moneriumOnrampMint";
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    const facts = getBlockState<MoneriumIssueRegistrationFacts>(state.state, MoneriumIssueContext);
    if (
      !RAW_INTEGER_PATTERN.test(facts.ownerEureBalanceBaselineRaw) ||
      !/^[1-9]\d*$/.test(facts.amountRaw) ||
      !isAddress(facts.owner) ||
      facts.token !== MONERIUM_EURE ||
      !Object.hasOwn(MONERIUM_ISSUE_NETWORKS, facts.chain)
    ) {
      throw this.createUnrecoverableError("MoneriumOnrampMintExecutor: invalid persisted settlement facts");
    }

    const targetBalanceRaw = new Big(facts.ownerEureBalanceBaselineRaw).plus(facts.amountRaw).toFixed(0);
    try {
      await this.waitForBalance(
        MONERIUM_ISSUE_NETWORKS[facts.chain].eureAddress,
        facts.owner,
        targetBalanceRaw,
        POLL_INTERVAL_MS,
        BALANCE_CHECK_TIMEOUT_MS,
        facts.chain,
        signal
      );
    } catch (error) {
      if (!(error instanceof BalanceCheckError)) throw error;
      throw this.createRecoverableError(`MoneriumOnrampMintExecutor: waiting for EURe settlement failed: ${error.message}`);
    }

    return state;
  }
}
