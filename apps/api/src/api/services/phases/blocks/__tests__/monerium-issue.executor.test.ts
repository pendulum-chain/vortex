import { describe, expect, it, mock } from "bun:test";
import { BalanceCheckError, BalanceCheckErrorType, Networks } from "@vortexfi/shared";
import Big from "big.js";
import { MoneriumOnrampMintExecutor } from "../phases/monerium-issue/execution";
import { MoneriumIssue } from "../phases/monerium-issue";

const OWNER = "0x1212121212121212121212121212121212121212";

function state(overrides: Record<string, unknown> = {}) {
  return {
    state: {
      blockState: {
        moneriumIssue: {
          amountRaw: "98",
          chain: Networks.Polygon,
          owner: OWNER,
          ownerEureBalanceBaselineRaw: "500",
          token: "EURE",
          ...overrides
        }
      }
    }
  };
}

describe("MoneriumOnrampMintExecutor", () => {
  it("provides one executor for its persisted phase", () => {
    const phase = MoneriumIssue(Networks.Base, "0.25");

    expect(phase.phases).toEqual(["moneriumOnrampMint"]);
    expect(phase.executors?.map(executor => executor.getPhaseName())).toEqual(phase.phases);
  });

  it("waits for the owner balance to increase by the quoted post-fee EURe amount", async () => {
    const waitForBalance = mock(async () => new Big("598"));
    const executor = new MoneriumOnrampMintExecutor(waitForBalance) as unknown as {
      executePhase(state: unknown): Promise<unknown>;
    };
    const rampState = state();

    expect(await executor.executePhase(rampState)).toBe(rampState);
    expect(waitForBalance).toHaveBeenCalledWith(
      "0x18ec0A6E18E5bc3784fDd3a3634b31245ab704F6",
      OWNER,
      "598",
      5000,
      300000,
      Networks.Polygon,
      undefined
    );
  });

  it.each([BalanceCheckErrorType.Timeout, BalanceCheckErrorType.ReadFailure])(
    "treats %s balance checks as recoverable",
    async errorType => {
      const waitForBalance = mock(async () => {
        throw new BalanceCheckError(errorType, "not settled");
      });
      const executor = new MoneriumOnrampMintExecutor(waitForBalance) as unknown as {
        executePhase(state: unknown): Promise<unknown>;
      };

      await expect(executor.executePhase(state())).rejects.toMatchObject({ isRecoverable: true });
    }
  );

  it.each([
    ["missing baseline", { ownerEureBalanceBaselineRaw: undefined }],
    ["fractional baseline", { ownerEureBalanceBaselineRaw: "500.5" }],
    ["negative amount", { amountRaw: "-1" }]
  ])("rejects corrupt persisted state with a %s", async (_label, overrides) => {
    const waitForBalance = mock(async () => new Big("598"));
    const executor = new MoneriumOnrampMintExecutor(waitForBalance) as unknown as {
      executePhase(state: unknown): Promise<unknown>;
    };

    await expect(executor.executePhase(state(overrides))).rejects.toMatchObject({
      isRecoverable: false,
      message: expect.stringContaining("invalid persisted settlement facts")
    });
    expect(waitForBalance).not.toHaveBeenCalled();
  });
});
