import type { QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.sequelize.query(
      `ALTER TABLE email_notifications
        ALTER COLUMN user_id DROP NOT NULL,
        ADD COLUMN recipient_email VARCHAR(254),
        ADD CONSTRAINT email_notifications_recipient_source_check CHECK (
          (user_id IS NOT NULL AND recipient_email IS NULL
            AND type <> 'managed_profile_membership_invitation')
          OR
          (user_id IS NULL AND recipient_email IS NOT NULL
            AND type = 'managed_profile_membership_invitation' AND provider = 'vortex'
            AND recipient_email = lower(btrim(recipient_email))
            AND recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
        )`,
      { transaction }
    );
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Refuse rollback while direct-recipient rows exist rather than discard the outbox/audit trail.
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.sequelize.query(
      `ALTER TABLE email_notifications
        ALTER COLUMN user_id SET NOT NULL,
        DROP CONSTRAINT email_notifications_recipient_source_check,
        DROP COLUMN recipient_email`,
      { transaction }
    );
  });
}
