import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.addColumn(
      "profiles",
      "kind",
      {
        allowNull: false,
        defaultValue: "authenticated",
        type: DataTypes.STRING(20)
      },
      { transaction }
    );
    await queryInterface.changeColumn(
      "profiles",
      "email",
      {
        allowNull: true,
        type: DataTypes.STRING(255)
      },
      { transaction }
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE profiles
        ADD CONSTRAINT chk_profiles_kind_email CHECK (
          (kind = 'authenticated' AND email IS NOT NULL)
          OR (kind = 'managed' AND email IS NULL)
        )`,
      { transaction }
    );
    await queryInterface.sequelize.query(
      `CREATE FUNCTION enforce_profile_kind_immutable() RETURNS trigger AS $$
      BEGIN
        IF OLD.kind <> NEW.kind THEN
          RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'chk_profiles_kind_immutable',
            MESSAGE = 'Profile kind cannot be changed after creation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_profiles_kind_immutable
        BEFORE UPDATE OF kind ON profiles
        FOR EACH ROW EXECUTE FUNCTION enforce_profile_kind_immutable();`,
      { transaction }
    );

    await queryInterface.createTable(
      "managed_profile_managers",
      {
        allowedCorridors: {
          allowNull: false,
          field: "allowed_corridors",
          type: DataTypes.ARRAY(DataTypes.STRING(2))
        },
        allowedCustomerTypes: {
          allowNull: true,
          defaultValue: null,
          field: "allowed_customer_types",
          type: DataTypes.ARRAY(DataTypes.STRING(10))
        },
        createdAt: {
          allowNull: false,
          defaultValue: DataTypes.NOW,
          field: "created_at",
          type: DataTypes.DATE
        },
        isActive: {
          allowNull: false,
          defaultValue: true,
          field: "is_active",
          type: DataTypes.BOOLEAN
        },
        profileId: {
          allowNull: false,
          field: "profile_id",
          onDelete: "RESTRICT",
          onUpdate: "CASCADE",
          primaryKey: true,
          references: { key: "id", model: "profiles" },
          type: DataTypes.UUID
        },
        updatedAt: {
          allowNull: false,
          defaultValue: DataTypes.NOW,
          field: "updated_at",
          type: DataTypes.DATE
        }
      },
      { transaction }
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE managed_profile_managers
        ADD CONSTRAINT chk_managed_profile_managers_allowed_corridors CHECK (
          allowed_corridors <@ ARRAY['AR', 'BR', 'CO', 'EU', 'MX', 'US']::varchar[]
          AND array_position(allowed_corridors, NULL) IS NULL
        ),
        ADD CONSTRAINT chk_managed_profile_managers_allowed_customer_types CHECK (
          allowed_customer_types IS NULL
          OR (
            allowed_customer_types <@ ARRAY['individual', 'business']::varchar[]
            AND array_position(allowed_customer_types, NULL) IS NULL
            AND cardinality(allowed_customer_types) BETWEEN 1 AND 2
            AND (
              cardinality(allowed_customer_types) = 1
              OR allowed_customer_types @> ARRAY['individual', 'business']::varchar[]
            )
          )
        )`,
      { transaction }
    );

    await queryInterface.createTable(
      "managed_profiles",
      {
        contactEmail: {
          allowNull: true,
          field: "contact_email",
          type: DataTypes.STRING(255)
        },
        createdAt: {
          allowNull: false,
          defaultValue: DataTypes.NOW,
          field: "created_at",
          type: DataTypes.DATE
        },
        creationSource: {
          allowNull: false,
          field: "creation_source",
          type: DataTypes.STRING(20)
        },
        deletedAt: {
          allowNull: true,
          field: "deleted_at",
          type: DataTypes.DATE
        },
        externalSubjectId: {
          allowNull: false,
          field: "external_subject_id",
          type: DataTypes.STRING(255)
        },
        id: {
          allowNull: false,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          type: DataTypes.UUID
        },
        managerProfileId: {
          allowNull: false,
          field: "manager_profile_id",
          onDelete: "RESTRICT",
          onUpdate: "CASCADE",
          references: { key: "profile_id", model: "managed_profile_managers" },
          type: DataTypes.UUID
        },
        profileId: {
          allowNull: false,
          field: "profile_id",
          onDelete: "RESTRICT",
          onUpdate: "CASCADE",
          references: { key: "id", model: "profiles" },
          type: DataTypes.UUID
        },
        status: {
          allowNull: false,
          defaultValue: "active",
          type: DataTypes.STRING(20)
        },
        updatedAt: {
          allowNull: false,
          defaultValue: DataTypes.NOW,
          field: "updated_at",
          type: DataTypes.DATE
        }
      },
      { transaction }
    );
    await queryInterface.addIndex("managed_profiles", ["profile_id"], {
      name: "uq_managed_profiles_profile_id",
      transaction,
      unique: true
    });
    await queryInterface.addIndex("managed_profiles", ["manager_profile_id", "external_subject_id"], {
      name: "uq_managed_profiles_manager_external_subject",
      transaction,
      unique: true
    });
    await queryInterface.addIndex("managed_profiles", ["manager_profile_id", "contact_email"], {
      name: "uq_managed_profiles_manager_contact_email",
      transaction,
      unique: true
    });
    await queryInterface.sequelize.query(
      `ALTER TABLE managed_profiles
        ADD CONSTRAINT chk_managed_profiles_not_self_managed CHECK (manager_profile_id <> profile_id),
        ADD CONSTRAINT chk_managed_profiles_status CHECK (status IN ('active', 'deleted')),
        ADD CONSTRAINT chk_managed_profiles_creation_source CHECK (creation_source IN ('manager', 'vortex')),
        ADD CONSTRAINT chk_managed_profiles_deletion CHECK (
          (status = 'active' AND deleted_at IS NULL)
          OR (status = 'deleted' AND deleted_at IS NOT NULL)
        )`,
      { transaction }
    );
    await queryInterface.sequelize.query(
      `CREATE FUNCTION enforce_managed_profile_contact_email_immutable() RETURNS trigger AS $$
      BEGIN
        IF OLD.contact_email IS DISTINCT FROM NEW.contact_email THEN
          RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'chk_managed_profiles_contact_email_immutable',
            MESSAGE = 'Managed profile contact email cannot be changed after creation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_managed_profiles_contact_email_immutable
        BEFORE UPDATE OF contact_email ON managed_profiles
        FOR EACH ROW EXECUTE FUNCTION enforce_managed_profile_contact_email_immutable();`,
      { transaction }
    );
    await queryInterface.sequelize.query(
      `CREATE FUNCTION enforce_managed_profile_external_subject_immutable() RETURNS trigger AS $$
      BEGIN
        IF OLD.external_subject_id IS DISTINCT FROM NEW.external_subject_id THEN
          RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'chk_managed_profiles_external_subject_immutable',
            MESSAGE = 'Managed profile external subject id cannot be changed after creation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_managed_profiles_external_subject_immutable
        BEFORE UPDATE OF external_subject_id ON managed_profiles
        FOR EACH ROW EXECUTE FUNCTION enforce_managed_profile_external_subject_immutable();`,
      { transaction }
    );

    await queryInterface.sequelize.query(
      `CREATE FUNCTION enforce_managed_profile_invariants() RETURNS trigger AS $$
      DECLARE
        affected_profile_ids uuid[] := ARRAY[]::uuid[];
        affected_manager_profile_ids uuid[] := ARRAY[]::uuid[];
      BEGIN
        IF TG_TABLE_NAME = 'profiles' THEN
          IF TG_OP = 'INSERT' THEN
            affected_profile_ids := ARRAY[NEW.id];
            affected_manager_profile_ids := ARRAY[NEW.id];
          ELSIF TG_OP = 'DELETE' THEN
            affected_profile_ids := ARRAY[OLD.id];
            affected_manager_profile_ids := ARRAY[OLD.id];
          ELSE
            affected_profile_ids := ARRAY[OLD.id, NEW.id];
            affected_manager_profile_ids := ARRAY[OLD.id, NEW.id];
          END IF;
        ELSIF TG_TABLE_NAME = 'managed_profiles' THEN
          IF TG_OP = 'INSERT' THEN
            affected_profile_ids := ARRAY[NEW.profile_id];
            affected_manager_profile_ids := ARRAY[NEW.manager_profile_id];
          ELSIF TG_OP = 'DELETE' THEN
            affected_profile_ids := ARRAY[OLD.profile_id];
            affected_manager_profile_ids := ARRAY[OLD.manager_profile_id];
          ELSE
            affected_profile_ids := ARRAY[OLD.profile_id, NEW.profile_id];
            affected_manager_profile_ids := ARRAY[OLD.manager_profile_id, NEW.manager_profile_id];
          END IF;
        ELSE
          IF TG_OP = 'INSERT' THEN
            affected_manager_profile_ids := ARRAY[NEW.profile_id];
          ELSIF TG_OP = 'DELETE' THEN
            affected_manager_profile_ids := ARRAY[OLD.profile_id];
          ELSE
            affected_manager_profile_ids := ARRAY[OLD.profile_id, NEW.profile_id];
          END IF;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM profiles p
          LEFT JOIN managed_profiles mp ON mp.profile_id = p.id
          WHERE p.id = ANY(affected_profile_ids)
            AND p.kind = 'managed'
            AND mp.id IS NULL
        ) THEN
          RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'chk_managed_profiles_no_orphans',
            MESSAGE = 'Every managed profile must have a managed_profiles relationship';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM managed_profiles mp
          JOIN profiles p ON p.id = mp.profile_id
          WHERE mp.profile_id = ANY(affected_profile_ids)
            AND p.kind <> 'managed'
        ) THEN
          RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'chk_managed_profiles_child_kind',
            MESSAGE = 'Managed profile relationships require a managed child profile';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM managed_profile_managers m
          JOIN profiles p ON p.id = m.profile_id
          WHERE m.profile_id = ANY(affected_manager_profile_ids)
            AND p.kind <> 'authenticated'
        ) THEN
          RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'chk_managed_profile_managers_profile_kind',
            MESSAGE = 'Managed profile managers must be authenticated profiles';
        END IF;

        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;

      CREATE CONSTRAINT TRIGGER trg_profiles_managed_profile_invariants
        AFTER INSERT OR UPDATE OR DELETE ON profiles
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION enforce_managed_profile_invariants();

      CREATE CONSTRAINT TRIGGER trg_managed_profile_managers_invariants
        AFTER INSERT OR UPDATE OR DELETE ON managed_profile_managers
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION enforce_managed_profile_invariants();

      CREATE CONSTRAINT TRIGGER trg_managed_profiles_invariants
        AFTER INSERT OR UPDATE OR DELETE ON managed_profiles
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION enforce_managed_profile_invariants();`,
      { transaction }
    );

    await queryInterface.sequelize.query("ALTER TABLE managed_profile_managers ENABLE ROW LEVEL SECURITY;", {
      transaction
    });
    await queryInterface.sequelize.query("ALTER TABLE managed_profiles ENABLE ROW LEVEL SECURITY;", { transaction });
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.sequelize.query("LOCK TABLE managed_profiles, managed_profile_managers IN ACCESS EXCLUSIVE MODE;", {
      transaction
    });
    const [managedState] = await queryInterface.sequelize.query(
      `SELECT
         EXISTS (SELECT 1 FROM managed_profiles) AS "hasProfiles",
         EXISTS (SELECT 1 FROM managed_profile_managers) AS "hasManagers"`,
      { transaction }
    );
    const state = managedState[0] as { hasManagers?: boolean; hasProfiles?: boolean } | undefined;
    if (state?.hasProfiles || state?.hasManagers) {
      throw new Error("Cannot revert managed-profile schema while managed profiles or manager configuration exist");
    }

    await queryInterface.sequelize.query("DROP TRIGGER trg_profiles_managed_profile_invariants ON profiles;", {
      transaction
    });
    await queryInterface.sequelize.query("DROP TRIGGER trg_profiles_kind_immutable ON profiles;", { transaction });
    await queryInterface.sequelize.query("DROP TRIGGER trg_managed_profiles_contact_email_immutable ON managed_profiles;", {
      transaction
    });
    await queryInterface.sequelize.query("DROP TRIGGER trg_managed_profiles_external_subject_immutable ON managed_profiles;", {
      transaction
    });
    await queryInterface.sequelize.query("DROP FUNCTION enforce_managed_profile_contact_email_immutable();", {
      transaction
    });
    await queryInterface.sequelize.query("DROP FUNCTION enforce_managed_profile_external_subject_immutable();", {
      transaction
    });
    await queryInterface.dropTable("managed_profiles", { transaction });
    await queryInterface.dropTable("managed_profile_managers", { transaction });
    await queryInterface.sequelize.query("DROP FUNCTION enforce_managed_profile_invariants();", { transaction });
    await queryInterface.sequelize.query("DROP FUNCTION enforce_profile_kind_immutable();", { transaction });
    await queryInterface.sequelize.query("ALTER TABLE profiles DROP CONSTRAINT chk_profiles_kind_email;", {
      transaction
    });
    await queryInterface.removeColumn("profiles", "kind", { transaction });
    await queryInterface.changeColumn(
      "profiles",
      "email",
      {
        allowNull: false,
        type: DataTypes.STRING(255)
      },
      { transaction }
    );
  });
}
