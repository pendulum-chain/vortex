import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("subsidies", {
    amount: {
      allowNull: false,
      comment: "Amount of subsidy payment as float32",
      type: DataTypes.FLOAT
    },
    created_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    payer_account: {
      allowNull: false,
      comment: "Account address that made the subsidy payment",
      type: DataTypes.STRING(255)
    },
    payment_date: {
      allowNull: false,
      comment: "Date when the subsidy payment was made",
      type: DataTypes.DATE
    },
    phase: {
      allowNull: false,
      comment: "Ramp phase during which the subsidy was applied",
      type: DataTypes.STRING(32)
    },
    ramp_id: {
      allowNull: false,
      comment: "Reference to the ramp state that received the subsidy",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "ramp_states"
      },
      type: DataTypes.UUID
    },
    token: {
      allowNull: false,
      comment: "Token used for the subsidy payment",
      type: DataTypes.ENUM("GLMR", "PEN", "XLM", "axlUSDC", "BRLA", "EURC")
    },
    transaction_hash: {
      allowNull: false,
      comment: "Transaction hash or external identifier for the subsidy payment",
      type: DataTypes.STRING(255)
    },
    updated_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    }
  });

  await queryInterface.addIndex("subsidies", ["ramp_id"], {
    name: "idx_subsidies_ramp_id"
  });

  await queryInterface.addIndex("subsidies", ["phase"], {
    name: "idx_subsidies_phase"
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex("subsidies", "idx_subsidies_ramp_id");
  await queryInterface.removeIndex("subsidies", "idx_subsidies_phase");

  await queryInterface.dropTable("subsidies");
}
