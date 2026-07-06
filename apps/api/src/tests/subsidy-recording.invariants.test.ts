import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { RampPhase } from "@vortexfi/shared";
import { BasePhaseHandler } from "../api/services/phases/base-phase-handler";
import RampState from "../models/rampState.model";
import Subsidy from "../models/subsidy.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestRampState } from "../test-utils/factories";

/**
 * Regression for the subsidy-recording gap fixed by migration 037
 * (docs/security-spec/06-cross-chain/fund-routing.md): finalSettlementSubsidy
 * records the assetSymbol from the dynamic SquidRouter token registry, whose
 * value set is open-ended (WETH, USDC.e, BNB, ...). While subsidies.token was
 * a Postgres enum, any symbol outside it made Subsidy.create throw — and
 * createSubsidy swallows insert errors, so the subsidy was paid on-chain but
 * never recorded. The column is now a VARCHAR; these symbols must round-trip.
 */

// Symbols reachable in production that the pre-037 enum rejected: USDC.e is in
// the static EVM config (Polygon/Arbitrum/Avalanche), WETH comes from the
// dynamic registry, BNB/AVAX are the handler's native symbols for BSC/Avalanche.
const NON_ENUM_SYMBOLS = ["USDC.e", "WETH", "BNB", "AVAX"];

class TestSubsidyHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "finalSettlementSubsidy";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    return state;
  }

  public recordSubsidy(state: RampState, token: string): Promise<void> {
    return this.createSubsidy(state, 1.23, token, "0x30a300612ab372CC73e53ffE87fB73d62Ed68Da3", "0xdeadbeef");
  }
}

describe("subsidy recording accepts dynamic-registry token symbols", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  it.each(NON_ENUM_SYMBOLS)("round-trips a '%s' subsidy row", async token => {
    const state = await createTestRampState();

    await Subsidy.create({
      amount: 1.23,
      payerAccount: "0x30a300612ab372CC73e53ffE87fB73d62Ed68Da3",
      paymentDate: new Date(),
      phase: "finalSettlementSubsidy",
      rampId: state.id,
      token,
      transactionHash: "0xdeadbeef"
    });

    const stored = await Subsidy.findOne({ where: { rampId: state.id } });
    expect(stored?.token).toBe(token);
  });

  // The full seam: createSubsidy swallows insert errors by design, so a
  // rejected token surfaced as *no row* rather than a failed phase. Assert the
  // row actually lands when the symbol comes through the handler path.
  it("createSubsidy persists a row for a symbol outside the legacy enum", async () => {
    const state = await createTestRampState();

    await new TestSubsidyHandler().recordSubsidy(state, "USDC.e");

    const stored = await Subsidy.findOne({ where: { rampId: state.id } });
    expect(stored).not.toBeNull();
    expect(stored?.token).toBe("USDC.e");
    expect(stored?.phase).toBe("finalSettlementSubsidy");
  });
});
