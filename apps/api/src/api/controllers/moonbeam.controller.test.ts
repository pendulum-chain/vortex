import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { EvmClientManager } from "@vortexfi/shared";
import { sendStatusWithPk } from "./moonbeam.controller";

const originalGetInstance = EvmClientManager.getInstance;
const getInstance = mock(() => {
  throw new Error("Moonbeam status must not initialize EVM clients");
});

beforeEach(() => {
  EvmClientManager.getInstance = getInstance as typeof EvmClientManager.getInstance;
  getInstance.mockClear();
});

afterEach(() => {
  EvmClientManager.getInstance = originalGetInstance;
});

describe("Moonbeam status", () => {
  it("preserves the unavailable response without polling Moonbeam", async () => {
    const status = await sendStatusWithPk();

    expect(status.status).toBe(false);
    expect(status).toHaveProperty("public");
    expect(getInstance).not.toHaveBeenCalled();
  });
});
