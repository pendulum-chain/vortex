import { describe, expect, it, mock } from "bun:test";
import { QueryInterface } from "sequelize";
import { down, up } from "./migrations/061-drop-legacy-api-keys";

describe("061-drop-legacy-api-keys migration", () => {
  it("drops only inactive legacy keys and their enum in one transaction", async () => {
    const commit = mock(async () => undefined);
    const rollback = mock(async () => undefined);
    const query = mock(async (_sql: string) => undefined);
    const transaction = { commit, rollback };
    const queryInterface = {
      sequelize: {
        query,
        transaction: mock(async () => transaction)
      }
    } as unknown as QueryInterface;

    await up(queryInterface);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain("WHERE is_active");
    expect(query.mock.calls[1]?.[0]).toContain("DROP TABLE api_keys");
    expect(query.mock.calls[1]?.[0]).toContain("DROP TYPE IF EXISTS enum_api_keys_key_type");
    expect(commit).toHaveBeenCalledTimes(1);
    expect(rollback).not.toHaveBeenCalled();
  });

  it("is irreversible", async () => {
    await expect(down()).rejects.toThrow("restore a pre-migration database backup");
  });
});
