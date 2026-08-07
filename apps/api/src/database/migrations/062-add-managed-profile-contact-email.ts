import { DataTypes, QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.addColumn(
      "managed_profiles",
      "contact_email",
      {
        allowNull: true,
        type: DataTypes.STRING(255)
      },
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
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.sequelize.query("DROP TRIGGER trg_managed_profiles_contact_email_immutable ON managed_profiles;", {
      transaction
    });
    await queryInterface.sequelize.query("DROP FUNCTION enforce_managed_profile_contact_email_immutable();", { transaction });
    await queryInterface.removeColumn("managed_profiles", "contact_email", { transaction });
  });
}
