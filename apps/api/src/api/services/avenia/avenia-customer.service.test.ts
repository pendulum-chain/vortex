import { afterEach, describe, expect, it, mock } from "bun:test";
import sequelize from "../../../config/database";
import KycCase from "../../../models/kycCase.model";
import ProviderCustomer, { VerificationStatus } from "../../../models/providerCustomer.model";
import { updateAveniaKycOutcomeForCustomer, updateAveniaKycProgressForCustomer } from "./avenia-customer.service";

const originalTransaction = sequelize.transaction;
const originalCustomerFindByPk = ProviderCustomer.findByPk;
const originalCaseFindAll = KycCase.findAll;

afterEach(() => {
  sequelize.transaction = originalTransaction;
  ProviderCustomer.findByPk = originalCustomerFindByPk;
  KycCase.findAll = originalCaseFindAll;
});

function setup(
  customerStatus: VerificationStatus,
  caseStatus: VerificationStatus,
  options: {
    caseUpdateFails?: boolean;
    customerStatusExternal?: string;
    caseStatusExternal?: string;
    providerCaseId?: string | null;
    verificationSubmission?: KycCase["verificationSubmission"];
  } = {}
) {
  const customer = {
    customerEntityId: "entity-1",
    customerType: "individual",
    id: "customer-1",
    status: customerStatus,
    statusExternal: options.customerStatusExternal ?? "customer-status",
    update: mock(async (values: Partial<ProviderCustomer>) => {
      Object.assign(customer, values);
      return customer;
    })
  } as unknown as ProviderCustomer;
  const kycCase = {
    approvedAt: caseStatus === VerificationStatus.Approved ? new Date("2026-01-01") : null,
    id: "case-1",
    providerCaseId: options.providerCaseId === undefined ? "attempt-1" : options.providerCaseId,
    rejectedAt: caseStatus === VerificationStatus.Rejected ? new Date("2026-01-02") : null,
    status: caseStatus,
    statusExternal: options.caseStatusExternal ?? "case-status",
    verificationSubmission: options.verificationSubmission ?? null,
    update: mock(async (values: Partial<KycCase>) => {
      if (options.caseUpdateFails) throw new Error("case update failed");
      Object.assign(kycCase, values);
      return kycCase;
    })
  } as unknown as KycCase;

  ProviderCustomer.findByPk = mock(async () => customer) as unknown as typeof ProviderCustomer.findByPk;
  KycCase.findAll = mock(async () => [kycCase]) as unknown as typeof KycCase.findAll;
  sequelize.transaction = mock(async callback => {
    const customerSnapshot = { status: customer.status, statusExternal: customer.statusExternal };
    const caseSnapshot = {
      approvedAt: kycCase.approvedAt,
      rejectedAt: kycCase.rejectedAt,
      status: kycCase.status,
      statusExternal: kycCase.statusExternal
    };
    try {
      return await callback({ LOCK: { UPDATE: "UPDATE" } } as never);
    } catch (error) {
      Object.assign(customer, customerSnapshot);
      Object.assign(kycCase, caseSnapshot);
      throw error;
    }
  }) as unknown as typeof sequelize.transaction;

  return { customer, kycCase };
}

describe("updateAveniaKycOutcomeForCustomer", () => {
  it("rolls back the customer update when the canonical case update fails", async () => {
    const { customer, kycCase } = setup(VerificationStatus.InReview, VerificationStatus.InReview, {
      caseUpdateFails: true
    });

    await expect(
      updateAveniaKycOutcomeForCustomer(customer, VerificationStatus.Approved, "COMPLETED", {
        id: "case-1",
        providerCaseId: "attempt-1"
      })
    ).rejects.toThrow("case update failed");

    expect(customer.status).toBe(VerificationStatus.InReview);
    expect(kycCase.status).toBe(VerificationStatus.InReview);
  });

  it("repairs a stale case when the customer is already approved", async () => {
    const { customer, kycCase } = setup(VerificationStatus.Approved, VerificationStatus.InReview, {
      customerStatusExternal: "COMPLETED"
    });

    await updateAveniaKycOutcomeForCustomer(customer, VerificationStatus.Approved, "COMPLETED", {
      id: "case-1",
      providerCaseId: "attempt-1"
    });

    expect(customer.status).toBe(VerificationStatus.Approved);
    expect(kycCase.status).toBe(VerificationStatus.Approved);
    expect(kycCase.statusExternal).toBe("COMPLETED");
    expect(kycCase.approvedAt).toBeInstanceOf(Date);
    expect(kycCase.rejectedAt).toBeNull();
  });

  it("does not downgrade either row for a stale rejection after approval", async () => {
    const { customer, kycCase } = setup(VerificationStatus.Approved, VerificationStatus.Approved, {
      customerStatusExternal: "COMPLETED",
      caseStatusExternal: "COMPLETED"
    });

    await updateAveniaKycOutcomeForCustomer(customer, VerificationStatus.Rejected, "REJECTED", {
      id: "case-1",
      providerCaseId: "attempt-1"
    });

    expect(customer.status).toBe(VerificationStatus.Approved);
    expect(customer.statusExternal).toBe("COMPLETED");
    expect(kycCase.status).toBe(VerificationStatus.Approved);
    expect(kycCase.statusExternal).toBe("COMPLETED");
    expect(kycCase.rejectedAt).toBeNull();
  });

  it("fails closed when multiple cases are linked to the customer", async () => {
    const { customer, kycCase } = setup(VerificationStatus.InReview, VerificationStatus.InReview);
    KycCase.findAll = mock(async () => [kycCase, { ...kycCase, id: "case-2" } as KycCase]) as unknown as typeof KycCase.findAll;

    await expect(
      updateAveniaKycOutcomeForCustomer(customer, VerificationStatus.Approved, "COMPLETED", {
        id: "case-1",
        providerCaseId: "attempt-1"
      })
    ).rejects.toThrow("binding requires reconciliation");

    expect(customer.status).toBe(VerificationStatus.InReview);
  });

  it("rejects a stale unbound outcome after a submission becomes ambiguous", async () => {
    const { customer } = setup(VerificationStatus.InReview, VerificationStatus.InReview, {
      providerCaseId: null,
      verificationSubmission: {
        actorProfileId: "user-1",
        attemptBaselineIds: [],
        status: "ambiguous",
        subjectProfileId: "user-1"
      }
    });

    await expect(
      updateAveniaKycOutcomeForCustomer(customer, VerificationStatus.Approved, "COMPLETED", {
        id: "case-1",
        providerCaseId: null
      })
    ).rejects.toThrow("binding requires reconciliation");
    expect(customer.status).toBe(VerificationStatus.InReview);
  });
});

describe("updateAveniaKycProgressForCustomer", () => {
  it("locks the provider before the exact case and preserves a rejection from a stale processing poll", async () => {
    const { customer, kycCase } = setup(VerificationStatus.Rejected, VerificationStatus.Rejected, {
      caseStatusExternal: "COMPLETED",
      customerStatusExternal: "COMPLETED"
    });
    const lockOrder: string[] = [];
    ProviderCustomer.findByPk = mock(async () => {
      lockOrder.push("provider");
      return customer;
    }) as unknown as typeof ProviderCustomer.findByPk;
    KycCase.findAll = mock(async options => {
      lockOrder.push("case");
      expect(options.where).toEqual({ id: "case-1", providerCaseId: "attempt-1", providerCustomerId: "customer-1" });
      return [kycCase];
    }) as unknown as typeof KycCase.findAll;

    const refreshed = await updateAveniaKycProgressForCustomer(
      customer,
      { id: "case-1", providerCaseId: "attempt-1" },
      VerificationStatus.InReview,
      "PROCESSING"
    );

    expect(lockOrder).toEqual(["provider", "case"]);
    expect(refreshed.status).toBe(VerificationStatus.Rejected);
    expect(refreshed.statusExternal).toBe("COMPLETED");
    expect(kycCase.status).toBe(VerificationStatus.Rejected);
    expect(kycCase.statusExternal).toBe("COMPLETED");
  });

  it("fails closed when the expected attempt is no longer the current case binding", async () => {
    const { customer } = setup(VerificationStatus.InReview, VerificationStatus.InReview);
    KycCase.findAll = mock(async () => []) as unknown as typeof KycCase.findAll;

    await expect(
      updateAveniaKycProgressForCustomer(
        customer,
        { id: "case-1", providerCaseId: "attempt-old" },
        VerificationStatus.Pending,
        "PENDING"
      )
    ).rejects.toThrow("binding requires reconciliation");

    expect(customer.status).toBe(VerificationStatus.InReview);
  });

  it("rejects stale unbound progress after a submission becomes submitted", async () => {
    const { customer } = setup(VerificationStatus.InReview, VerificationStatus.InReview, {
      providerCaseId: null,
      verificationSubmission: {
        actorProfileId: "user-1",
        attemptBaselineIds: [],
        status: "submitted",
        subjectProfileId: "user-1"
      }
    });

    await expect(
      updateAveniaKycProgressForCustomer(
        customer,
        { id: "case-1", providerCaseId: null },
        VerificationStatus.Pending,
        "PENDING"
      )
    ).rejects.toThrow("binding requires reconciliation");
    expect(customer.status).toBe(VerificationStatus.InReview);
  });
});
