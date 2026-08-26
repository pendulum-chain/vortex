import { describe, expect, it } from "bun:test";
import { Networks } from "@vortexfi/shared";
import { MoneriumOnrampMintExecutor } from "../phases/monerium-issue/execution";
import { MoneriumIssue } from "../phases/monerium-issue";

describe("MoneriumOnrampMintExecutor", () => {
  it("provides one executor for its persisted phase", () => {
    const phase = MoneriumIssue(Networks.Base, "0.25");

    expect(phase.phases).toEqual(["moneriumOnrampMint"]);
    expect(phase.executors?.map(executor => executor.getPhaseName())).toEqual(phase.phases);
  });

  it("fails closed while incoming payments lack deterministic correlation", async () => {
    const executor = new MoneriumOnrampMintExecutor() as unknown as {
      executePhase(state: unknown): Promise<unknown>;
    };

    await expect(executor.executePhase({})).rejects.toMatchObject({
      isRecoverable: false,
      message:
        "MoneriumOnrampMintExecutor: deterministic incoming-payment correlation is not available; settlement is disabled"
    });
  });
});
