import { beforeAll, describe, expect, it } from "bun:test";
import sequelize from "../config/database";
import CustomerEntity from "../models/customerEntity.model";
import KycCase from "../models/kycCase.model";
import ProviderCustomer, { VerificationStatus } from "../models/providerCustomer.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestUser } from "../test-utils/factories";
import { down, up } from "./migrations/066-add-kyc-verification-state";

async function createCase(options: { customerType?: "individual" | "business"; providerCustomer?: boolean; type?: "kyc" | "kyb" } = {}): Promise<KycCase> {
  const customerType = options.customerType ?? "individual";
  const user = await createTestUser();
  const entity = await CustomerEntity.create({ country: "BR", profileId: user.id, status: "active", type: customerType });
  const providerCustomer =
    options.providerCustomer === false
      ? null
      : await ProviderCustomer.create({
          country: "BR",
          customerEntityId: entity.id,
          customerType,
          provider: "avenia",
          providerCustomerId: `avenia-${crypto.randomUUID()}`,
          rail: "brl",
          status: VerificationStatus.Pending
        });
  return KycCase.create({
    customerEntityId: entity.id,
    provider: "avenia",
    providerCustomerId: providerCustomer?.id ?? null,
    status: VerificationStatus.Pending,
    type: options.type ?? "kyc"
  });
}

describe("066 KYC verification state", () => {
  beforeAll(async () => {
    await setupTestDatabase();
    await resetTestDatabase();
  });

  it("backfills every existing Avenia KYC case while leaving new cases nullable and enforcing state", async () => {
    const existing = await createCase();
    const existingBusiness = await createCase({ customerType: "business" });
    const existingWithoutCustomer = await createCase({ providerCustomer: false });
    const existingKyb = await createCase({ customerType: "business", type: "kyb" });
    expect(existing.verificationMethod).toBeNull();

    await down(sequelize.getQueryInterface());
    await up(sequelize.getQueryInterface());

    expect((await existing.reload()).verificationMethod).toBe("standard");
    expect((await existingBusiness.reload()).verificationMethod).toBe("standard");
    expect((await existingWithoutCustomer.reload()).verificationMethod).toBe("standard");
    expect((await existingKyb.reload()).verificationMethod).toBeNull();
    const [submissionTable] = await sequelize.query(
      "SELECT to_regclass('public.kyc_verification_submissions') AS \"tableName\""
    );
    expect((submissionTable[0] as { tableName: string | null }).tableName).toBeNull();
    const createdAfterMigration = await createCase();
    expect(createdAfterMigration.verificationMethod).toBeNull();
    expect(createdAfterMigration.verificationSubmission).toBeNull();

    await expect(createdAfterMigration.update({ verificationMethod: "sumsub_share_token" })).resolves.toBeInstanceOf(KycCase);
    await expect(createdAfterMigration.update({ verificationMethod: "standard" })).rejects.toThrow();
    await expect(
      sequelize.query("UPDATE kyc_cases SET verification_submission = '{\"status\":\"invalid\"}' WHERE id = :id", {
        replacements: { id: createdAfterMigration.id }
      })
    ).rejects.toThrow();

    const invalidSubmissions = [
      { actorProfileId: "actor", attemptBaselineIds: [], status: null, subjectProfileId: "subject" },
      { actorProfileId: "actor", attemptBaselineIds: [], status: "prepared", subjectProfileId: "subject" },
      { actorProfileId: "actor", attemptBaselineIds: ["valid", null], status: "prepared", subjectProfileId: "subject" },
      { actorProfileId: "actor", attemptBaselineIds: ["valid", 1], status: "prepared", subjectProfileId: "subject" },
      { actorProfileId: "actor", attemptBaselineIds: [""], status: "prepared", subjectProfileId: "subject" },
      {
        actorProfileId: "actor",
        attemptBaselineIds: [],
        consentAttestations: [],
        idempotencyKeyHash: "key-hash",
        status: "prepared",
        subjectProfileId: "subject",
        tokenFingerprint: "token-fingerprint"
      },
      {
        actorProfileId: "actor",
        attemptBaselineIds: [],
        consentAttestations: [
          {
            actorProfileId: "actor",
            attestedAt: new Date().toISOString(),
            policyVersion: "sumsub-share-v1",
            subjectProfileId: "subject"
          }
        ],
        idempotencyKeyHash: "key-hash",
        importToken: "raw-token-must-never-be-persisted",
        status: "prepared",
        subjectProfileId: "subject",
        tokenFingerprint: "token-fingerprint"
      },
      {
        actorProfileId: "actor",
        attemptBaselineIds: [],
        consentAttestations: [
          {
            actorProfileId: "actor",
            attestedAt: new Date().toISOString(),
            extra: "unknown",
            policyVersion: "sumsub-share-v1",
            subjectProfileId: "subject"
          }
        ],
        idempotencyKeyHash: "key-hash",
        status: "prepared",
        subjectProfileId: "subject",
        tokenFingerprint: "token-fingerprint"
      }
    ];
    for (const submission of invalidSubmissions) {
      await expect(
        sequelize.query("UPDATE kyc_cases SET verification_submission = CAST(:submission AS JSONB) WHERE id = :id", {
          replacements: { id: createdAfterMigration.id, submission: JSON.stringify(submission) }
        })
      ).rejects.toThrow();
    }

    await createdAfterMigration.update({
      verificationSubmission: {
        actorProfileId: crypto.randomUUID(),
        attemptBaselineIds: [],
        consentAttestations: [
          {
            actorProfileId: crypto.randomUUID(),
            attestedAt: new Date().toISOString(),
            policyVersion: "sumsub-share-v1",
            subjectProfileId: crypto.randomUUID()
          }
        ],
        idempotencyKeyHash: "key-hash",
        status: "prepared",
        subjectProfileId: crypto.randomUUID(),
        tokenFingerprint: "token-fingerprint"
      }
    });

    const standardCase = await createCase();
    await standardCase.update({ verificationMethod: "standard" });
    await expect(
      sequelize.query("UPDATE kyc_cases SET verification_submission = CAST(:submission AS JSONB) WHERE id = :id", {
        replacements: {
          id: standardCase.id,
          submission: JSON.stringify({
            actorProfileId: "actor",
            attemptBaselineIds: [],
            status: "prepared",
            subjectProfileId: "subject"
          })
        }
      })
    ).rejects.toThrow();
    await expect(
      sequelize.query("UPDATE kyc_cases SET verification_submission = CAST(:submission AS JSONB) WHERE id = :id", {
        replacements: {
          id: standardCase.id,
          submission: JSON.stringify({
            actorProfileId: "actor",
            attemptBaselineIds: [],
            idempotencyKeyHash: "forbidden-token-field",
            payloadFingerprint: "payload-fingerprint",
            status: "prepared",
            subjectProfileId: "subject"
          })
        }
      })
    ).rejects.toThrow();
    await standardCase.update({
      verificationSubmission: {
        actorProfileId: "actor",
        attemptBaselineIds: [],
        payloadFingerprint: "payload-fingerprint",
        status: "prepared",
        subjectProfileId: "subject"
      }
    });
    await expect(down(sequelize.getQueryInterface())).rejects.toThrow(
      "Cannot revert KYC verification state while verification state exists"
    );
  });
});
