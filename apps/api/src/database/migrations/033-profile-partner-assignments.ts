import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("profile_partner_assignments", {
    buyPartnerId: {
      allowNull: true,
      field: "buy_partner_id",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "partners"
      },
      type: DataTypes.UUID
    },
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    expiresAt: {
      allowNull: true,
      field: "expires_at",
      type: DataTypes.DATE
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
    partnerName: {
      allowNull: false,
      field: "partner_name",
      type: DataTypes.STRING(100)
    },
    sellPartnerId: {
      allowNull: true,
      field: "sell_partner_id",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "partners"
      },
      type: DataTypes.UUID
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    },
    userId: {
      allowNull: false,
      field: "user_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: {
        key: "id",
        model: "profiles"
      },
      type: DataTypes.UUID
    }
  });

  await queryInterface.addIndex("profile_partner_assignments", ["user_id"], {
    name: "idx_profile_partner_assignments_user_id"
  });

  await queryInterface.addIndex("profile_partner_assignments", ["partner_name"], {
    name: "idx_profile_partner_assignments_partner_name"
  });

  await queryInterface.addIndex("profile_partner_assignments", ["buy_partner_id"], {
    name: "idx_profile_partner_assignments_buy_partner"
  });

  await queryInterface.addIndex("profile_partner_assignments", ["sell_partner_id"], {
    name: "idx_profile_partner_assignments_sell_partner"
  });

  await queryInterface.addIndex("profile_partner_assignments", ["user_id", "is_active", "expires_at"], {
    name: "idx_profile_partner_assignments_active_lookup"
  });

  await queryInterface.addIndex("profile_partner_assignments", ["user_id"], {
    name: "uniq_profile_partner_assignments_active_user",
    unique: true,
    where: { is_active: true }
  });

  await queryInterface.addColumn("quote_tickets", "pricing_partner_id", {
    allowNull: true,
    onDelete: "SET NULL",
    onUpdate: "CASCADE",
    references: {
      key: "id",
      model: "partners"
    },
    type: DataTypes.UUID
  });

  await queryInterface.addIndex("quote_tickets", ["pricing_partner_id"], {
    name: "idx_quote_tickets_pricing_partner"
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex("quote_tickets", "idx_quote_tickets_pricing_partner");
  await queryInterface.removeColumn("quote_tickets", "pricing_partner_id");

  await queryInterface.removeIndex("profile_partner_assignments", "uniq_profile_partner_assignments_active_user");
  await queryInterface.removeIndex("profile_partner_assignments", "idx_profile_partner_assignments_active_lookup");
  await queryInterface.removeIndex("profile_partner_assignments", "idx_profile_partner_assignments_sell_partner");
  await queryInterface.removeIndex("profile_partner_assignments", "idx_profile_partner_assignments_buy_partner");
  await queryInterface.removeIndex("profile_partner_assignments", "idx_profile_partner_assignments_partner_name");
  await queryInterface.removeIndex("profile_partner_assignments", "idx_profile_partner_assignments_user_id");
  await queryInterface.dropTable("profile_partner_assignments");
}
