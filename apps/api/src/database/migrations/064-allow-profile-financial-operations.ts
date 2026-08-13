import type { QueryInterface } from "sequelize";

const CONSTRAINT = "financial_operations_scope_type_check";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.removeConstraint("financial_operations", CONSTRAINT, { transaction });
    await queryInterface.sequelize.query(
      `ALTER TABLE financial_operations
       ADD CONSTRAINT ${CONSTRAINT}
       CHECK (scope_type IN ('profile', 'quote', 'ramp'));`,
      { transaction }
    );
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async transaction => {
    const [result] = await queryInterface.sequelize.query(
      `SELECT EXISTS (
         SELECT 1 FROM financial_operations WHERE scope_type = 'profile'
       ) AS "hasProfileOperations";`,
      { transaction }
    );
    const rows = result as Array<{ hasProfileOperations: boolean }>;
    if (rows[0]?.hasProfileOperations) {
      throw new Error("Cannot restore the financial-operation scope constraint while profile operations exist");
    }
    await queryInterface.removeConstraint("financial_operations", CONSTRAINT, { transaction });
    await queryInterface.sequelize.query(
      `ALTER TABLE financial_operations
       ADD CONSTRAINT ${CONSTRAINT}
       CHECK (scope_type IN ('quote', 'ramp'));`,
      { transaction }
    );
  });
}
