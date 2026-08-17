import { describe, expect, it, mock } from "bun:test";
import type { QueryInterface } from "sequelize";
import { down } from "./migrations/063-create-managed-profiles";

describe("063 managed-profile rollback", () => {
  it("refuses to discard manager-only configuration", async () => {
    const dropTable = mock(async () => undefined);
    const query = mock(async (sql: string) => {
      if (sql.includes("EXISTS (SELECT 1 FROM managed_profiles)")) {
        return [[{ hasManagers: true, hasProfiles: false }], {}];
      }
      return [[], {}];
    });
    const transaction = {};
    const queryInterface = {
      dropTable,
      sequelize: {
        query,
        transaction: async (callback: (value: object) => Promise<void>) => callback(transaction)
      }
    } as unknown as QueryInterface;

    await expect(down(queryInterface)).rejects.toThrow(
      "Cannot revert managed-profile schema while managed profiles or manager configuration exist"
    );
    expect(query).toHaveBeenCalledWith(
      "LOCK TABLE managed_profiles, managed_profile_managers IN ACCESS EXCLUSIVE MODE;",
      { transaction }
    );
    expect(dropTable).not.toHaveBeenCalled();
  });
});
