import { DataTypes, type QueryInterface } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.addColumn(
      "kyc_cases",
      "verification_method",
      {
        allowNull: true,
        type: DataTypes.STRING(32)
      },
      { transaction }
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE kyc_cases
        ADD CONSTRAINT chk_kyc_cases_verification_method CHECK (
          verification_method IS NULL
          OR verification_method IN ('standard', 'sumsub_share_token')
        )`,
      { transaction }
    );
    await queryInterface.addColumn(
      "kyc_cases",
      "verification_submission",
      {
        allowNull: true,
        type: DataTypes.JSONB
      },
      { transaction }
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE kyc_cases
        ADD CONSTRAINT chk_kyc_cases_verification_submission CHECK (
          verification_submission IS NULL
          OR (
            jsonb_typeof(verification_submission) = 'object'
            AND verification_submission ? 'status'
            AND verification_submission ? 'actorProfileId'
            AND verification_submission ? 'subjectProfileId'
            AND verification_submission ? 'attemptBaselineIds'
            AND jsonb_typeof(verification_submission->'status') = 'string'
            AND verification_submission->>'status' IN ('prepared', 'submitted', 'confirmed', 'ambiguous', 'failed')
            AND jsonb_typeof(verification_submission->'actorProfileId') = 'string'
            AND verification_submission->>'actorProfileId' <> ''
            AND jsonb_typeof(verification_submission->'subjectProfileId') = 'string'
            AND verification_submission->>'subjectProfileId' <> ''
            AND jsonb_typeof(verification_submission->'attemptBaselineIds') = 'array'
            AND NOT jsonb_path_exists(
              verification_submission,
              '$.attemptBaselineIds[*] ? (@.type() != "string" || @ == "")'
            )
            AND (
              NOT verification_submission ? 'errorClassification'
              OR (
                jsonb_typeof(verification_submission->'errorClassification') = 'string'
                AND verification_submission->>'errorClassification' <> ''
              )
            )
            AND (
              (
                verification_method = 'sumsub_share_token'
                AND verification_submission - ARRAY[
                  'status', 'actorProfileId', 'subjectProfileId', 'attemptBaselineIds', 'errorClassification',
                  'idempotencyKeyHash', 'tokenFingerprint', 'consentAttestations'
                ] = '{}'::jsonb
                AND verification_submission ? 'idempotencyKeyHash'
                AND verification_submission ? 'tokenFingerprint'
                AND verification_submission ? 'consentAttestations'
                AND jsonb_typeof(verification_submission->'idempotencyKeyHash') = 'string'
                AND verification_submission->>'idempotencyKeyHash' <> ''
                AND jsonb_typeof(verification_submission->'tokenFingerprint') = 'string'
                AND verification_submission->>'tokenFingerprint' <> ''
                AND jsonb_typeof(verification_submission->'consentAttestations') = 'array'
                AND jsonb_array_length(verification_submission->'consentAttestations') > 0
                AND NOT jsonb_path_exists(
                  verification_submission,
                  '$.consentAttestations[*] ? (@.type() != "object" || !exists(@.actorProfileId) || @.actorProfileId.type() != "string" || @.actorProfileId == "" || !exists(@.subjectProfileId) || @.subjectProfileId.type() != "string" || @.subjectProfileId == "" || !exists(@.policyVersion) || @.policyVersion.type() != "string" || @.policyVersion == "" || !exists(@.attestedAt) || @.attestedAt.type() != "string" || @.attestedAt == "")'
                )
                AND NOT jsonb_path_exists(
                  verification_submission,
                  '$.consentAttestations[*].keyvalue() ? (@.key != "actorProfileId" && @.key != "subjectProfileId" && @.key != "policyVersion" && @.key != "attestedAt")'
                )
              )
              OR (
                verification_method = 'standard'
                AND verification_submission - ARRAY[
                  'status', 'actorProfileId', 'subjectProfileId', 'attemptBaselineIds', 'errorClassification',
                  'payloadFingerprint'
                ] = '{}'::jsonb
                AND verification_submission ? 'payloadFingerprint'
                AND jsonb_typeof(verification_submission->'payloadFingerprint') = 'string'
                AND verification_submission->>'payloadFingerprint' <> ''
              )
            )
          )
        );

       UPDATE kyc_cases AS kc
       SET verification_method = 'standard'
       WHERE kc.type = 'kyc'
         AND kc.provider = 'avenia';`,
      { transaction }
    );
    await queryInterface.sequelize.query(
      `CREATE FUNCTION enforce_kyc_case_verification_method_immutable() RETURNS trigger AS $$
      BEGIN
        IF OLD.verification_method IS NOT NULL
          AND OLD.verification_method IS DISTINCT FROM NEW.verification_method THEN
          RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'chk_kyc_cases_verification_method_immutable',
            MESSAGE = 'KYC case verification method cannot be cleared or changed after selection';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_kyc_cases_verification_method_immutable
        BEFORE UPDATE OF verification_method ON kyc_cases
        FOR EACH ROW EXECUTE FUNCTION enforce_kyc_case_verification_method_immutable();`,
      { transaction }
    );
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.sequelize.query(
      `LOCK TABLE kyc_cases IN ACCESS EXCLUSIVE MODE;
       DO $$
       BEGIN
          IF EXISTS (
            SELECT 1 FROM kyc_cases
            WHERE verification_method IS NOT NULL OR verification_submission IS NOT NULL
          ) THEN
            RAISE EXCEPTION 'Cannot revert KYC verification state while verification state exists';
         END IF;
       END;
       $$;`,
      { transaction }
    );
    await queryInterface.sequelize.query("DROP TRIGGER trg_kyc_cases_verification_method_immutable ON kyc_cases;", {
      transaction
    });
    await queryInterface.sequelize.query("DROP FUNCTION enforce_kyc_case_verification_method_immutable();", {
      transaction
    });
    await queryInterface.sequelize.query("ALTER TABLE kyc_cases DROP CONSTRAINT chk_kyc_cases_verification_method;", {
      transaction
    });
    await queryInterface.sequelize.query("ALTER TABLE kyc_cases DROP CONSTRAINT chk_kyc_cases_verification_submission;", {
      transaction
    });
    await queryInterface.removeColumn("kyc_cases", "verification_submission", { transaction });
    await queryInterface.removeColumn("kyc_cases", "verification_method", { transaction });
  });
}
