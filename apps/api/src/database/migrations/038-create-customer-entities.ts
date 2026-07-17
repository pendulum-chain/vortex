import { DataTypes, QueryInterface } from "sequelize";

// Creates customer_entities (the legal/compliance customer anchor between profiles and
// provider/KYC tables — see docs/architecture/unified-user-management-schema.md) and
// backfills one 'individual' entity per existing profile.
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable("customer_entities", {
    country: {
      allowNull: true,
      type: DataTypes.STRING(10)
    },
    created_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    },
    id: {
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      type: DataTypes.UUID
    },
    profile_id: {
      allowNull: true,
      type: DataTypes.UUID
    },
    status: {
      allowNull: false,
      defaultValue: "active",
      type: DataTypes.STRING(20)
    },
    type: {
      allowNull: false,
      defaultValue: "individual",
      type: DataTypes.STRING(20)
    },
    updated_at: {
      allowNull: false,
      defaultValue: DataTypes.NOW,
      type: DataTypes.DATE
    }
  });

  // profile_id is nullable by design: compliance records outlive a deleted profile.
  await queryInterface.addConstraint("customer_entities", {
    fields: ["profile_id"],
    name: "fk_customer_entities_profile_id",
    onDelete: "SET NULL",
    onUpdate: "CASCADE",
    references: {
      field: "id",
      table: "profiles"
    },
    type: "foreign key"
  });

  // VARCHAR + CHECK instead of ENUM for evolvable product states (plan D6).
  await queryInterface.sequelize.query(
    `ALTER TABLE "customer_entities" ADD CONSTRAINT "chk_customer_entities_type" CHECK (type IN ('individual', 'business'));`
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "customer_entities" ADD CONSTRAINT "chk_customer_entities_status" CHECK (status IN ('active', 'archived', 'blocked'));`
  );

  // Non-unique: the schema stays capable of multiple entities per profile even though v1
  // creates exactly one (plan D4).
  await queryInterface.addIndex("customer_entities", ["profile_id"], {
    name: "idx_customer_entities_profile_id"
  });

  // Supabase grants anon/authenticated ALL on new public tables via ALTER DEFAULT PRIVILEGES;
  // RLS with no policies denies PostgREST access while the API's direct connection (table
  // owner) is unaffected. Required on every new table holding customer data.
  await queryInterface.sequelize.query(`ALTER TABLE "customer_entities" ENABLE ROW LEVEL SECURITY;`);

  // Backfill: one individual/active entity per existing profile. Idempotent via anti-join.
  await queryInterface.sequelize.query(`
    INSERT INTO customer_entities (id, profile_id, type, status, created_at, updated_at)
    SELECT uuid_generate_v4(), p.id, 'individual', 'active', p.created_at, NOW()
    FROM profiles p
    LEFT JOIN customer_entities ce ON ce.profile_id = p.id
    WHERE ce.id IS NULL;
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable("customer_entities");
}
