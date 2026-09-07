import { DataTypes, QueryInterface } from "sequelize";

const TABLES = [
  "managed_profile_memberships",
  "managed_profile_membership_invitations",
  "managed_profile_membership_events"
] as const;

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.createTable(
      "managed_profile_memberships",
      {
        created_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE },
        created_by_profile_id: {
          allowNull: true,
          onDelete: "RESTRICT",
          onUpdate: "CASCADE",
          references: { key: "id", model: "profiles" },
          type: DataTypes.UUID
        },
        id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
        managed_profile_id: {
          allowNull: false,
          onDelete: "RESTRICT",
          onUpdate: "CASCADE",
          references: { key: "profile_id", model: "managed_profiles" },
          type: DataTypes.UUID
        },
        member_profile_id: {
          allowNull: false,
          onDelete: "RESTRICT",
          onUpdate: "CASCADE",
          references: { key: "id", model: "profiles" },
          type: DataTypes.UUID
        },
        revoked_at: { allowNull: true, type: DataTypes.DATE },
        revoked_by_profile_id: {
          allowNull: true,
          onDelete: "RESTRICT",
          onUpdate: "CASCADE",
          references: { key: "id", model: "profiles" },
          type: DataTypes.UUID
        },
        role: { allowNull: false, type: DataTypes.STRING(16) },
        updated_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE }
      },
      { transaction }
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE managed_profile_memberships
         ADD CONSTRAINT chk_managed_profile_memberships_role
           CHECK (role IN ('manager', 'read_only')),
         ADD CONSTRAINT chk_managed_profile_memberships_revocation
           CHECK ((revoked_at IS NULL) = (revoked_by_profile_id IS NULL));

       CREATE UNIQUE INDEX uq_managed_profile_memberships_active
         ON managed_profile_memberships (managed_profile_id, member_profile_id)
         WHERE revoked_at IS NULL;

       CREATE INDEX idx_managed_profile_memberships_member
         ON managed_profile_memberships (member_profile_id, created_at);`,
      { transaction }
    );

    await queryInterface.createTable(
      "managed_profile_membership_invitations",
      {
        accepted_at: { allowNull: true, type: DataTypes.DATE },
        accepted_by_profile_id: {
          allowNull: true,
          onDelete: "RESTRICT",
          onUpdate: "CASCADE",
          references: { key: "id", model: "profiles" },
          type: DataTypes.UUID
        },
        cancelled_at: { allowNull: true, type: DataTypes.DATE },
        cancelled_by_profile_id: {
          allowNull: true,
          onDelete: "RESTRICT",
          onUpdate: "CASCADE",
          references: { key: "id", model: "profiles" },
          type: DataTypes.UUID
        },
        created_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE },
        email: { allowNull: false, type: DataTypes.STRING(255) },
        expired_at: { allowNull: true, type: DataTypes.DATE },
        expires_at: { allowNull: false, type: DataTypes.DATE },
        id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
        invited_by_profile_id: {
          allowNull: false,
          onDelete: "RESTRICT",
          onUpdate: "CASCADE",
          references: { key: "id", model: "profiles" },
          type: DataTypes.UUID
        },
        managed_profile_id: {
          allowNull: false,
          onDelete: "RESTRICT",
          onUpdate: "CASCADE",
          references: { key: "profile_id", model: "managed_profiles" },
          type: DataTypes.UUID
        },
        role: { allowNull: false, type: DataTypes.STRING(16) },
        updated_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE }
      },
      { transaction }
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE managed_profile_membership_invitations
         ADD CONSTRAINT chk_managed_profile_membership_invitations_role
           CHECK (role IN ('manager', 'read_only')),
         ADD CONSTRAINT chk_managed_profile_membership_invitations_email
           CHECK (email <> '' AND email = lower(btrim(email))),
         ADD CONSTRAINT chk_managed_profile_membership_invitations_terminal_state CHECK (
           num_nonnulls(accepted_at, cancelled_at, expired_at) <= 1
           AND (accepted_at IS NULL) = (accepted_by_profile_id IS NULL)
           AND (cancelled_at IS NULL) = (cancelled_by_profile_id IS NULL)
           AND (expired_at IS NULL OR expired_at = expires_at)
         );

       CREATE UNIQUE INDEX uq_managed_profile_membership_invitations_pending
         ON managed_profile_membership_invitations (managed_profile_id, email)
         WHERE accepted_at IS NULL AND cancelled_at IS NULL AND expired_at IS NULL;

       CREATE INDEX idx_managed_profile_membership_invitations_child_created
         ON managed_profile_membership_invitations (managed_profile_id, created_at);`,
      { transaction }
    );

    await queryInterface.createTable(
      "managed_profile_membership_events",
      {
        action: { allowNull: false, type: DataTypes.STRING(32) },
        actor_profile_id: {
          allowNull: true,
          onDelete: "RESTRICT",
          onUpdate: "CASCADE",
          references: { key: "id", model: "profiles" },
          type: DataTypes.UUID
        },
        created_at: { allowNull: false, defaultValue: DataTypes.NOW, type: DataTypes.DATE },
        id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
        invitation_id: {
          allowNull: true,
          onDelete: "RESTRICT",
          onUpdate: "CASCADE",
          references: { key: "id", model: "managed_profile_membership_invitations" },
          type: DataTypes.UUID
        },
        managed_profile_id: {
          allowNull: false,
          onDelete: "RESTRICT",
          onUpdate: "CASCADE",
          references: { key: "profile_id", model: "managed_profiles" },
          type: DataTypes.UUID
        },
        member_profile_id: {
          allowNull: true,
          onDelete: "RESTRICT",
          onUpdate: "CASCADE",
          references: { key: "id", model: "profiles" },
          type: DataTypes.UUID
        },
        previous_role: { allowNull: true, type: DataTypes.STRING(16) },
        role: { allowNull: true, type: DataTypes.STRING(16) },
        subject_email: { allowNull: true, type: DataTypes.STRING(255) }
      },
      { transaction }
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE managed_profile_membership_events
         ADD CONSTRAINT chk_managed_profile_membership_events_action CHECK (
           action IN (
             'member_added',
             'invited',
             'invitation_cancelled',
             'invitation_expired',
             'invitation_accepted',
             'role_changed',
             'member_removed'
           )
         ),
         ADD CONSTRAINT chk_managed_profile_membership_events_previous_role
           CHECK (previous_role IS NULL OR previous_role IN ('manager', 'read_only')),
         ADD CONSTRAINT chk_managed_profile_membership_events_role
           CHECK (role IS NULL OR role IN ('manager', 'read_only')),
         ADD CONSTRAINT chk_managed_profile_membership_events_subject_email
           CHECK (subject_email IS NULL OR (subject_email <> '' AND subject_email = lower(btrim(subject_email))));

       CREATE INDEX idx_managed_profile_membership_events_child_created
         ON managed_profile_membership_events (managed_profile_id, created_at DESC, id DESC);`,
      { transaction }
    );

    // Existing relationships predate event attribution, so they intentionally receive no event.
    await queryInterface.sequelize.query(
      `INSERT INTO managed_profile_memberships (
         id,
         managed_profile_id,
         member_profile_id,
         role,
         created_by_profile_id,
         created_at,
         updated_at
       )
       SELECT
         uuid_generate_v4(),
         mp.profile_id,
         mp.manager_profile_id,
         'manager',
         NULL,
         mp.created_at,
         mp.created_at
       FROM managed_profiles mp;`,
      { transaction }
    );

    await queryInterface.sequelize.query(
      `CREATE FUNCTION enforce_managed_profile_manager_immutable() RETURNS trigger AS $$
       BEGIN
         IF OLD.manager_profile_id IS DISTINCT FROM NEW.manager_profile_id THEN
           RAISE EXCEPTION USING
             ERRCODE = '23514',
             CONSTRAINT = 'chk_managed_profiles_manager_immutable',
             MESSAGE = 'Managed profile owner cannot be changed after creation';
         END IF;
         RETURN NEW;
       END;
       $$ LANGUAGE plpgsql;

       CREATE TRIGGER trg_managed_profiles_manager_immutable
         BEFORE UPDATE OF manager_profile_id ON managed_profiles
         FOR EACH ROW EXECUTE FUNCTION enforce_managed_profile_manager_immutable();

       CREATE FUNCTION enforce_managed_profile_owner_membership() RETURNS trigger AS $$
       DECLARE
         relationship managed_profiles%ROWTYPE;
       BEGIN
         SELECT * INTO relationship
         FROM managed_profiles
         WHERE profile_id = OLD.managed_profile_id;

         IF relationship.status = 'active'
           AND relationship.manager_profile_id = OLD.member_profile_id
           AND (
             TG_OP = 'DELETE'
             OR NEW.managed_profile_id IS DISTINCT FROM OLD.managed_profile_id
             OR NEW.member_profile_id IS DISTINCT FROM OLD.member_profile_id
             OR NEW.role <> 'manager'
             OR NEW.revoked_at IS NOT NULL
           )
         THEN
           RAISE EXCEPTION USING
             ERRCODE = '23514',
             CONSTRAINT = 'chk_managed_profiles_owner_membership',
             MESSAGE = 'Active managed profile owner membership cannot be downgraded or removed';
         END IF;

         IF TG_OP = 'DELETE' THEN
           RETURN OLD;
         END IF;
         RETURN NEW;
       END;
       $$ LANGUAGE plpgsql;

       CREATE TRIGGER trg_managed_profile_memberships_owner_protection
         BEFORE UPDATE OR DELETE ON managed_profile_memberships
         FOR EACH ROW EXECUTE FUNCTION enforce_managed_profile_owner_membership();`,
      { transaction }
    );

    await queryInterface.sequelize.query(
      `CREATE FUNCTION enforce_managed_profile_membership_invariants() RETURNS trigger AS $$
       DECLARE
         affected_managed_profile_ids uuid[] := ARRAY[]::uuid[];
         affected_member_profile_ids uuid[] := ARRAY[]::uuid[];
       BEGIN
         IF TG_TABLE_NAME = 'managed_profile_memberships' THEN
           IF TG_OP = 'INSERT' THEN
             affected_managed_profile_ids := ARRAY[NEW.managed_profile_id];
             affected_member_profile_ids := ARRAY[NEW.member_profile_id];
           ELSIF TG_OP = 'DELETE' THEN
             affected_managed_profile_ids := ARRAY[OLD.managed_profile_id];
             affected_member_profile_ids := ARRAY[OLD.member_profile_id];
           ELSE
             affected_managed_profile_ids := ARRAY[OLD.managed_profile_id, NEW.managed_profile_id];
             affected_member_profile_ids := ARRAY[OLD.member_profile_id, NEW.member_profile_id];
           END IF;
         ELSIF TG_TABLE_NAME = 'managed_profiles' THEN
           IF TG_OP = 'INSERT' THEN
             affected_managed_profile_ids := ARRAY[NEW.profile_id];
           ELSIF TG_OP = 'DELETE' THEN
             affected_managed_profile_ids := ARRAY[OLD.profile_id];
           ELSE
             affected_managed_profile_ids := ARRAY[OLD.profile_id, NEW.profile_id];
           END IF;
         ELSE
           IF TG_OP = 'INSERT' THEN
             affected_member_profile_ids := ARRAY[NEW.id];
           ELSIF TG_OP = 'DELETE' THEN
             affected_member_profile_ids := ARRAY[OLD.id];
           ELSE
             affected_member_profile_ids := ARRAY[OLD.id, NEW.id];
           END IF;
         END IF;

         IF EXISTS (
           SELECT 1
           FROM managed_profile_memberships membership
           JOIN profiles member ON member.id = membership.member_profile_id
           WHERE membership.member_profile_id = ANY(affected_member_profile_ids)
             AND member.kind <> 'authenticated'
         ) THEN
           RAISE EXCEPTION USING
             ERRCODE = '23514',
             CONSTRAINT = 'chk_managed_profile_memberships_member_kind',
             MESSAGE = 'Managed profile members must be authenticated profiles';
         END IF;

         IF EXISTS (
           SELECT 1
           FROM managed_profiles relationship
           WHERE relationship.profile_id = ANY(affected_managed_profile_ids)
             AND relationship.status = 'active'
             AND NOT EXISTS (
               SELECT 1
               FROM managed_profile_memberships membership
               WHERE membership.managed_profile_id = relationship.profile_id
                 AND membership.member_profile_id = relationship.manager_profile_id
                 AND membership.role = 'manager'
                 AND membership.revoked_at IS NULL
             )
         ) THEN
           RAISE EXCEPTION USING
             ERRCODE = '23514',
             CONSTRAINT = 'chk_managed_profiles_owner_membership',
             MESSAGE = 'Active managed profiles require an active owner manager membership';
         END IF;

         RETURN NULL;
       END;
       $$ LANGUAGE plpgsql;

       CREATE CONSTRAINT TRIGGER trg_managed_profile_memberships_invariants
         AFTER INSERT OR UPDATE OR DELETE ON managed_profile_memberships
         DEFERRABLE INITIALLY DEFERRED
         FOR EACH ROW EXECUTE FUNCTION enforce_managed_profile_membership_invariants();

       CREATE CONSTRAINT TRIGGER trg_managed_profiles_membership_invariants
         AFTER INSERT OR UPDATE OR DELETE ON managed_profiles
         DEFERRABLE INITIALLY DEFERRED
         FOR EACH ROW EXECUTE FUNCTION enforce_managed_profile_membership_invariants();

       CREATE CONSTRAINT TRIGGER trg_profiles_membership_invariants
         AFTER INSERT OR UPDATE OR DELETE ON profiles
         DEFERRABLE INITIALLY DEFERRED
         FOR EACH ROW EXECUTE FUNCTION enforce_managed_profile_membership_invariants();`,
      { transaction }
    );

    await queryInterface.sequelize.query(
      `CREATE FUNCTION reject_managed_profile_membership_event_mutation() RETURNS trigger AS $$
       BEGIN
         RAISE EXCEPTION USING
           ERRCODE = '23514',
           CONSTRAINT = 'chk_managed_profile_membership_events_append_only',
           MESSAGE = 'Managed profile membership events are append-only';
       END;
       $$ LANGUAGE plpgsql;

       CREATE TRIGGER trg_managed_profile_membership_events_append_only
         BEFORE UPDATE OR DELETE ON managed_profile_membership_events
         FOR EACH ROW EXECUTE FUNCTION reject_managed_profile_membership_event_mutation();`,
      { transaction }
    );

    for (const table of TABLES) {
      await queryInterface.sequelize.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`, { transaction });
    }
    await queryInterface.sequelize.query(
      `DO $$
       DECLARE
         role_name text;
         table_name text;
       BEGIN
         FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
           IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
             FOREACH table_name IN ARRAY ARRAY[
               'managed_profile_memberships',
               'managed_profile_membership_invitations',
               'managed_profile_membership_events'
             ] LOOP
               EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM %I', table_name, role_name);
             END LOOP;
           END IF;
         END LOOP;
       END;
       $$;`,
      { transaction }
    );
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.sequelize.query(
      `LOCK TABLE
         managed_profile_membership_events,
         managed_profile_membership_invitations,
         managed_profile_memberships,
         managed_profiles
       IN ACCESS EXCLUSIVE MODE;`,
      { transaction }
    );
    const [rows] = await queryInterface.sequelize.query(
      `SELECT
         EXISTS (SELECT 1 FROM managed_profile_membership_events) AS "hasEvents",
         EXISTS (SELECT 1 FROM managed_profile_membership_invitations) AS "hasInvitations",
         EXISTS (
           SELECT 1
           FROM managed_profile_memberships membership
           LEFT JOIN managed_profiles relationship
             ON relationship.profile_id = membership.managed_profile_id
           WHERE relationship.profile_id IS NULL
              OR membership.member_profile_id <> relationship.manager_profile_id
              OR membership.role <> 'manager'
              OR membership.created_by_profile_id IS NOT NULL
              OR membership.revoked_at IS NOT NULL
              OR membership.revoked_by_profile_id IS NOT NULL
         ) AS "hasNonBackfillMemberships",
         EXISTS (
           SELECT 1
           FROM managed_profiles relationship
           WHERE NOT EXISTS (
             SELECT 1
             FROM managed_profile_memberships membership
             WHERE membership.managed_profile_id = relationship.profile_id
               AND membership.member_profile_id = relationship.manager_profile_id
               AND membership.role = 'manager'
               AND membership.created_by_profile_id IS NULL
               AND membership.revoked_at IS NULL
               AND membership.revoked_by_profile_id IS NULL
           )
         ) AS "hasMissingBackfillMemberships";`,
      { transaction }
    );
    const state = rows[0] as
      | {
          hasEvents?: boolean;
          hasInvitations?: boolean;
          hasMissingBackfillMemberships?: boolean;
          hasNonBackfillMemberships?: boolean;
        }
      | undefined;
    if (state?.hasEvents || state?.hasInvitations || state?.hasMissingBackfillMemberships || state?.hasNonBackfillMemberships) {
      throw new Error("Cannot revert managed-profile memberships after membership activity has been recorded");
    }

    await queryInterface.sequelize.query("DROP TRIGGER trg_managed_profiles_membership_invariants ON managed_profiles;", {
      transaction
    });
    await queryInterface.sequelize.query("DROP TRIGGER trg_profiles_membership_invariants ON profiles;", { transaction });
    await queryInterface.sequelize.query("DROP TRIGGER trg_managed_profiles_manager_immutable ON managed_profiles;", {
      transaction
    });
    await queryInterface.dropTable("managed_profile_membership_events", { transaction });
    await queryInterface.dropTable("managed_profile_membership_invitations", { transaction });
    await queryInterface.dropTable("managed_profile_memberships", { transaction });
    await queryInterface.sequelize.query("DROP FUNCTION reject_managed_profile_membership_event_mutation();", {
      transaction
    });
    await queryInterface.sequelize.query("DROP FUNCTION enforce_managed_profile_membership_invariants();", {
      transaction
    });
    await queryInterface.sequelize.query("DROP FUNCTION enforce_managed_profile_owner_membership();", { transaction });
    await queryInterface.sequelize.query("DROP FUNCTION enforce_managed_profile_manager_immutable();", { transaction });
  });
}
