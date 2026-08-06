import { expect, mock, test } from "bun:test";
import type { QueryInterface } from "sequelize";
import { up } from "./migrations/062-add-kyb-submission-state";

test("fails before schema changes when duplicate Avenia cases exist", async () => {
  const addColumn = mock(async () => undefined);
  const queryInterface = {
    addColumn,
    sequelize: {
      query: mock(async () => [[{ provider_customer_id: "customer-1" }], undefined])
    }
  } as unknown as QueryInterface;

  await expect(up(queryInterface)).rejects.toThrow("duplicate rows exist");
  expect(addColumn).not.toHaveBeenCalled();
});
