import { DataTypes, Op, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Create anchors table
  await queryInterface.createTable("anchors", {
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    currency: {
      allowNull: false,
      defaultValue: "USD",
      type: DataTypes.STRING(8)
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    identifier: {
      allowNull: true,
      comment: 'Optional context, e.g., network name, anchor name, or "default"',
      type: DataTypes.STRING(100)
    },
    isActive: {
      allowNull: false,
      defaultValue: true,
      field: "is_active",
      type: DataTypes.BOOLEAN
    },
    rampType: {
      allowNull: false,
      field: "ramp_type",
      type: DataTypes.ENUM("on", "off")
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    },
    value: {
      allowNull: false,
      type: DataTypes.DECIMAL(10, 4)
    },
    valueType: {
      allowNull: false,
      field: "value_type",
      type: DataTypes.ENUM("absolute", "relative")
    }
  });

  // Add index for faster lookups
  await queryInterface.addIndex("anchors", ["ramp_type", "identifier", "is_active"], {
    name: "idx_anchors_lookup"
  });

  // Insert initial data for fees
  await queryInterface.bulkInsert("anchors", [
    {
      created_at: new Date(),
      currency: "BRL",
      id: queryInterface.sequelize.literal("uuid_generate_v4()"),
      identifier: "moonbeam_brla",
      is_active: true, // 0.75 BRL
      ramp_type: "on",
      updated_at: new Date(),
      value: 0.75,
      value_type: "absolute"
    },
    {
      created_at: new Date(),
      currency: "BRL",
      id: queryInterface.sequelize.literal("uuid_generate_v4()"),
      identifier: "moonbeam_brla",
      is_active: true, // 0.75 BRL
      ramp_type: "off",
      updated_at: new Date(),
      value: 0.75,
      value_type: "absolute"
    },
    {
      created_at: new Date(),
      currency: "EUR",
      id: queryInterface.sequelize.literal("uuid_generate_v4()"),
      identifier: "stellar_eurc",
      is_active: true, // 0.25% (represented as decimal)
      ramp_type: "off",
      updated_at: new Date(),
      value: 0.0025,
      value_type: "relative"
    },
    {
      created_at: new Date(),
      currency: "ARS",
      id: queryInterface.sequelize.literal("uuid_generate_v4()"),
      identifier: "stellar_ars",
      is_active: true, // 2% (represented as decimal)
      ramp_type: "off",
      updated_at: new Date(),
      value: 0.02,
      value_type: "relative"
    },
    {
      created_at: new Date(),
      currency: "ARS",
      id: queryInterface.sequelize.literal("uuid_generate_v4()"),
      identifier: "stellar_ars",
      is_active: true, // 10 ARS
      ramp_type: "off",
      updated_at: new Date(),
      value: 10.0,
      value_type: "absolute"
    }
  ]);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Remove the initial data
  await queryInterface.bulkDelete("anchors", {
    identifier: {
      [Op.in]: ["moonbeam_brla", "stellar_eurc", "stellar_ars"]
    }
  });

  // Remove the index
  await queryInterface.removeIndex("anchors", "idx_anchors_lookup");

  // Drop the anchors table
  await queryInterface.dropTable("anchors");
}
