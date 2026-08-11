import { describe, expect, it, mock } from "bun:test";
import type { QueryInterface } from "sequelize";
import { down } from "./migrations/064-allow-profile-financial-operations";

describe("064 profile financial-operation rollback", () => {
  it("refuses to narrow the constraint while profile operations exist", async () => {
    const removeConstraint = mock(async () => undefined);
    const transaction = {};
    const query = mock(async () => [[{ hasProfileOperations: true }], {}]);
    const queryInterface = {
      removeConstraint,
      sequelize: {
        query,
        transaction: async (callback: (value: object) => Promise<void>) => callback(transaction)
      }
    } as unknown as QueryInterface;

    await expect(down(queryInterface)).rejects.toThrow(
      "Cannot restore the financial-operation scope constraint while profile operations exist"
    );
    expect(removeConstraint).not.toHaveBeenCalled();
  });
});
