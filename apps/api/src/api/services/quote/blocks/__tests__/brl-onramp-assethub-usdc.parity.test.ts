import { describe, expect, it } from "bun:test";
import { AssetHubToken, EPaymentMethod, FiatToken, Networks, RampDirection, type RampPhase } from "@vortexfi/shared";
import { QuoteService } from "../../index";
import { allocateNonces } from "../core/prepare";
import { assemblePhaseFlow } from "../core/phase-flow";
import { resolveBlockFlow } from "../flows/catalog";
import { brlOnrampAssethubUsdcFlow } from "../flows/brl-onramp-assethub-usdc";
import { PendulumToAssethubXcmExecutor } from "../phases/pendulum-to-assethub-xcm/execution";

const REQUEST = {
  from: EPaymentMethod.PIX,
  inputAmount: "100",
  inputCurrency: FiatToken.BRL,
  network: Networks.AssetHub,
  outputCurrency: AssetHubToken.USDC,
  rampType: RampDirection.BUY,
  to: Networks.AssetHub
};

const PHASES: RampPhase[] = [
  "initial",
  "brlaOnrampMint",
  "fundEphemeral",
  "moonbeamToPendulumXcm",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "distributeFees",
  "subsidizePostSwap",
  "pendulumToAssethubXcm",
  "complete"
];

describe("BRL Avenia to AssetHub USDC block flow", () => {
  it("derives the production phase sequence and executor coverage", () => {
    expect(assemblePhaseFlow(brlOnrampAssethubUsdcFlow)).toEqual(PHASES);
    expect(brlOnrampAssethubUsdcFlow.executors.map(executor => executor.getPhaseName())).toEqual(PHASES.slice(1, -1));
  });

  it("is cataloged only for PIX BRL to AssetHub USDC", () => {
    expect(resolveBlockFlow(REQUEST).name).toBe("BrlOnrampAssethubUsdc");
    expect(() => resolveBlockFlow({ ...REQUEST, outputCurrency: AssetHubToken.USDT })).toThrow("No block flow mapped");
  });

  it("remains explicitly disabled at production quote eligibility", async () => {
    await expect(new QuoteService().createQuote(REQUEST)).rejects.toMatchObject({ status: 400 });
  });

  it("reserves the second Moonbeam XCM nonce independently from Pendulum", () => {
    const txs = allocateNonces([
      {
        lane: "main",
        network: Networks.Moonbeam,
        nonceSpan: 2,
        phase: "moonbeamToPendulumXcm",
        signer: "0xmoonbeam",
        txData: "0x01"
      },
      {
        lane: "main",
        network: Networks.Pendulum,
        phase: "nablaApprove",
        signer: "pendulum",
        txData: "0x02"
      },
      {
        lane: "cleanup",
        network: Networks.Moonbeam,
        phase: "moonbeamCleanup",
        signer: "0xmoonbeam",
        txData: "0x03"
      },
      {
        lane: "cleanup",
        network: Networks.Pendulum,
        phase: "pendulumCleanup",
        signer: "pendulum",
        txData: "0x04"
      }
    ]);
    expect(txs.map(tx => [tx.phase, tx.nonce])).toEqual([
      ["moonbeamToPendulumXcm", 0],
      ["nablaApprove", 0],
      ["moonbeamCleanup", 2],
      ["pendulumCleanup", 1]
    ]);
  });

  it("does not resubmit a persisted Pendulum to AssetHub XCM", async () => {
    const state = { state: { pendulumToAssethubXcmHash: "0xsubmitted", substrateEphemeralAddress: "5substrate" } };
    const result = await (new PendulumToAssethubXcmExecutor() as never as { executePhase(state: unknown): Promise<unknown> }).executePhase(
      state
    );
    expect(result).toBe(state);
  });
});
