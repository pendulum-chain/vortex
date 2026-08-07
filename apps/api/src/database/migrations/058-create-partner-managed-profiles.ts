import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("partner_managed_profiles", {
    claimedAt: {
      allowNull: true,
      field: "claimed_at",
      type: DataTypes.DATE
    },
    createdAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
      type: DataTypes.DATE
    },
    externalUserId: {
      allowNull: false,
      field: "external_user_id",
      type: DataTypes.STRING(255)
    },
    id: {
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    partnerId: {
      allowNull: false,
      field: "partner_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: { key: "id", model: "partners" },
      type: DataTypes.UUID
    },
    profileId: {
      allowNull: false,
      field: "profile_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: { key: "id", model: "profiles" },
      type: DataTypes.UUID
    },
    subjectType: {
      allowNull: false,
      field: "subject_type",
      type: DataTypes.ENUM("individual", "business", "technical")
    },
    updatedAt: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
      type: DataTypes.DATE
    }
  });

  await queryInterface.addIndex("partner_managed_profiles", ["partner_id", "external_user_id"], {
    name: "uq_partner_managed_profiles_partner_external_user",
    unique: true
  });
  await queryInterface.addIndex("partner_managed_profiles", ["profile_id"], {
    name: "uq_partner_managed_profiles_profile_id",
    unique: true
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable("partner_managed_profiles");
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_partner_managed_profiles_subject_type";');
}
