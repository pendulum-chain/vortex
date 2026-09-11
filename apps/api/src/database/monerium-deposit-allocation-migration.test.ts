import { describe, expect, it } from "bun:test";
import { QueryInterface } from "sequelize";
import { down } from "./migrations/076-create-monerium-deposit-allocations";

describe("Monerium deposit allocation migration rollback", () => {
  it("refuses to discard allocation accounting", async () => {
    const schemaChanges: string[] = [];
    const queryInterface = {
      addColumn: async () => {
        schemaChanges.push("addColumn");
      },
      dropTable: async () => {
        schemaChanges.push("dropTable");
      },
      sequelize: {
        query: async () => [[{ count: 1 }], undefined]
      }
    } as unknown as QueryInterface;

    await expect(down(queryInterface)).rejects.toThrow(
      "Cannot roll back Monerium deposit allocations after accounting rows have been created"
    );
    expect(schemaChanges).toEqual([]);
  });
});
