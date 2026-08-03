import { afterEach, describe, expect, it, mock } from "bun:test";
import CustomerEntity from "../../models/customerEntity.model";
import ProviderCustomer, { VerificationStatus } from "../../models/providerCustomer.model";
import { getRampInfo } from "./rampInfo.service";

const originalEntityFindAll = CustomerEntity.findAll;
const originalCustomerFindAll = ProviderCustomer.findAll;

afterEach(() => {
  CustomerEntity.findAll = originalEntityFindAll;
  ProviderCustomer.findAll = originalCustomerFindAll;
});

describe("getRampInfo", () => {
  it("returns only sanitized corridor eligibility for the credential profile", async () => {
    CustomerEntity.findAll = mock(async options => {
      expect(options?.where).toEqual({ profileId: "profile-1" });
      return [{ id: "entity-1" }];
    }) as never;
    ProviderCustomer.findAll = mock(async () => [
      { country: null, provider: "avenia", status: VerificationStatus.Approved },
      { country: "MX", provider: "alfredpay", status: VerificationStatus.InReview },
      { country: "US", provider: "alfredpay", status: VerificationStatus.Rejected }
    ]) as never;

    const result = await getRampInfo("profile-1");

    expect(result).toEqual({
      corridors: {
        AR: { canBuy: false, canSell: false, kycStatus: "not_started" },
        BR: { canBuy: true, canSell: true, kycStatus: "approved" },
        CO: { canBuy: false, canSell: false, kycStatus: "not_started" },
        MX: { canBuy: false, canSell: false, kycStatus: "pending" },
        US: { canBuy: false, canSell: false, kycStatus: "rejected" }
      }
    });
    expect(JSON.stringify(result)).not.toMatch(/profile|customer|provider|limit|reason/i);
  });

  it("does not query provider records when the profile has no customer entity", async () => {
    CustomerEntity.findAll = mock(async () => []) as never;
    ProviderCustomer.findAll = mock(async () => []) as never;

    const result = await getRampInfo("profile-1");

    expect(ProviderCustomer.findAll).not.toHaveBeenCalled();
    expect(Object.values(result.corridors).every(corridor => corridor.kycStatus === "not_started")).toBe(true);
  });
});
