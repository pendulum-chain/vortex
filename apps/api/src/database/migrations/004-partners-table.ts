import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Create partners table
  await queryInterface.createTable("partners", {
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    displayName: {
      allowNull: false,
      field: "display_name",
      type: DataTypes.STRING(100)
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    isActive: {
      allowNull: false,
      defaultValue: true,
      field: "is_active",
      type: DataTypes.BOOLEAN
    },
    logoUrl: {
      allowNull: true,
      field: "logo_url",
      type: DataTypes.STRING(255)
    },
    markupCurrency: {
      allowNull: true,
      field: "markup_currency",
      type: DataTypes.STRING(8)
    },
    markupType: {
      allowNull: false,
      defaultValue: "none",
      field: "markup_type",
      type: DataTypes.ENUM("absolute", "relative", "none")
    },
    markupValue: {
      allowNull: false,
      defaultValue: 0,
      field: "markup_value",
      type: DataTypes.DECIMAL(10, 4)
    },
    name: {
      allowNull: false,
      type: DataTypes.STRING(100)
    },
    payoutAddress: {
      allowNull: true,
      field: "payout_address",
      type: DataTypes.STRING(255)
    },
    rampType: {
      allowNull: false,
      defaultValue: "on",
      field: "ramp_type",
      type: DataTypes.ENUM("on", "off")
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    },
    vortexFeeType: {
      allowNull: false,
      defaultValue: "none",
      field: "vortex_fee_type",
      type: DataTypes.ENUM("absolute", "relative", "none")
    },
    vortexFeeValue: {
      allowNull: false,
      defaultValue: 0,
      field: "vortex_fee_value",
      type: DataTypes.DECIMAL(10, 4)
    }
  });

  // Add composite index for faster lookups
  await queryInterface.addIndex("partners", ["name", "ramp_type"], {
    name: "idx_partners_name_ramp_type"
  });

  // Insert Vortex as a partner
  await queryInterface.bulkInsert("partners", [
    {
      created_at: new Date(),
      display_name: "Vortex",
      id: queryInterface.sequelize.literal("uuid_generate_v4()"),
      is_active: true,
      markup_currency: "USDC", // 0.01% (represented as decimal)
      markup_type: "relative",
      markup_value: 0.0001,
      name: "vortex",
      payout_address: "6emGJgvN86YVYj5jENjfoMfEvX5p8hMHJGSYPpbtvHNEHTgy",
      ramp_type: "on",
      updated_at: new Date(),
      vortex_fee_type: "none",
      vortex_fee_value: 0
    },
    {
      created_at: new Date(),
      display_name: "Vortex",
      id: queryInterface.sequelize.literal("uuid_generate_v4()"),
      is_active: true,
      markup_currency: "USDC", // 0.01% (represented as decimal)
      markup_type: "relative",
      markup_value: 0.0001,
      name: "vortex",
      payout_address: "6emGJgvN86YVYj5jENjfoMfEvX5p8hMHJGSYPpbtvHNEHTgy",
      ramp_type: "off",
      updated_at: new Date(),
      vortex_fee_type: "none",
      vortex_fee_value: 0
    }
  ]);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Remove the Vortex partner
  await queryInterface.bulkDelete("partners", { name: "vortex" });

  // Remove the composite index
  await queryInterface.removeIndex("partners", "idx_partners_name_ramp_type");

  // Drop the partners table if needed
  await queryInterface.dropTable("partners");
}
