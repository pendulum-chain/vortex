import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("mykobo_customers", {
    created_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    email: {
      allowNull: false,
      type: DataTypes.STRING,
      unique: true
    },
    id: {
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    last_failure_reasons: {
      allowNull: true,
      defaultValue: [],
      type: DataTypes.ARRAY(DataTypes.STRING)
    },
    status: {
      allowNull: false,
      defaultValue: "CONSULTED",
      type: DataTypes.ENUM("CONSULTED", "PENDING", "APPROVED", "REJECTED")
    },
    status_external: {
      allowNull: true,
      type: DataTypes.STRING
    },
    type: {
      allowNull: false,
      defaultValue: "INDIVIDUAL",
      type: DataTypes.ENUM("INDIVIDUAL", "BUSINESS")
    },
    updated_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    user_id: {
      allowNull: false,
      type: DataTypes.UUID,
      unique: true
    }
  });

  await queryInterface.addConstraint("mykobo_customers", {
    fields: ["user_id"],
    name: "fk_mykobo_customers_user_id",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    references: {
      field: "id",
      table: "profiles"
    },
    type: "foreign key"
  });

  await queryInterface.addIndex("mykobo_customers", ["user_id"], {
    name: "idx_mykobo_customers_user_id",
    unique: true
  });

  await queryInterface.addIndex("mykobo_customers", ["email"], {
    name: "idx_mykobo_customers_email",
    unique: true
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeConstraint("mykobo_customers", "fk_mykobo_customers_user_id");

  await queryInterface.dropTable("mykobo_customers");

  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_mykobo_customers_status";').catch(() => {});
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_mykobo_customers_type";').catch(() => {});
}
