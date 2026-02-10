import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("alfredpay_customers", {
    alfred_pay_id: {
      allowNull: false,
      type: DataTypes.STRING,
      unique: true
    },
    country: {
      allowNull: false,
      type: DataTypes.ENUM("MX", "AR", "BR", "CO", "DO", "US", "CN", "HK", "CL", "PE", "BO")
    },
    created_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    email: {
      allowNull: false,
      type: DataTypes.STRING
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
      type: DataTypes.ENUM("CONSULTED", "LINK_OPENED", "USER_COMPLETED", "VERIFYING", "FAILED", "SUCCESS")
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
      type: DataTypes.UUID
    }
  });

  // Add foreign key constraint for user_id
  await queryInterface.addConstraint("alfredpay_customers", {
    fields: ["user_id"],
    name: "fk_alfredpay_customers_user_id",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    references: {
      field: "id",
      table: "profiles"
    },
    type: "foreign key"
  });

  // Indexes
  await queryInterface.addIndex("alfredpay_customers", ["user_id"], {
    name: "idx_alfredpay_customers_user_id"
  });

  await queryInterface.addIndex("alfredpay_customers", ["alfred_pay_id"], {
    name: "idx_alfredpay_customers_alfred_pay_id",
    unique: true
  });

  await queryInterface.addIndex("alfredpay_customers", ["email"], {
    name: "idx_alfredpay_customers_email"
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Remove FK
  await queryInterface.removeConstraint("alfredpay_customers", "fk_alfredpay_customers_user_id");

  // Drop table
  await queryInterface.dropTable("alfredpay_customers");

  // Drop enums
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_alfredpay_customers_country";').catch(() => {});
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_alfredpay_customers_status";').catch(() => {});
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_alfredpay_customers_type";').catch(() => {});
}
