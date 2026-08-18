import { afterEach, describe, expect, it, mock } from "bun:test";
import { Networks } from "../../helpers/networks";
import { EvmClientManager } from "./clientManager";
import { checkEvmBalancePeriodically } from "./balance";

const originalGetInstance = EvmClientManager.getInstance;

afterEach(() => {
  EvmClientManager.getInstance = originalGetInstance;
});

describe("EVM balance polling", () => {
  it("reports the last actual and required raw token balances on timeout", async () => {
    EvmClientManager.getInstance = mock(
      () =>
        ({
          readContractWithRetry: async () => "4977578489"
        }) as unknown as EvmClientManager
    );

    await expect(
      checkEvmBalancePeriodically(
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
        "4977578490",
        0,
        -1,
        Networks.Base
      )
    ).rejects.toThrow("actual raw: 4977578489, required raw: 4977578490");
  });
});
