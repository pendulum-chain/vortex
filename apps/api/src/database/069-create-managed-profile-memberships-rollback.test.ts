import { describe, expect, it, mock } from "bun:test";
import type { QueryInterface } from "sequelize";
import { down } from "./migrations/069-create-managed-profile-memberships";

describe("069 managed-profile memberships rollback", () => {
  it("refuses to discard membership activity", async () => {
    const dropTable = mock(async () => undefined);
    const query = mock(async (sql: string) => {
      if (sql.includes('AS "hasEvents"')) {
        return [[{ hasEvents: true }], {}];
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
      "Cannot revert managed-profile memberships after membership activity has been recorded"
    );
    expect(query).toHaveBeenCalledWith(
      `LOCK TABLE
         managed_profile_membership_events,
         managed_profile_membership_invitations,
         managed_profile_memberships,
         managed_profiles
       IN ACCESS EXCLUSIVE MODE;`,
      { transaction }
    );
    expect(dropTable).not.toHaveBeenCalled();
  });
});
