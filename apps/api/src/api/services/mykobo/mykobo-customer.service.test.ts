import { afterEach, describe, expect, it, mock } from "bun:test";
import { MykoboApiService, MykoboCustomerStatus } from "@vortexfi/shared";
import MykoboCustomer from "../../../models/mykoboCustomer.model";
import User from "../../../models/user.model";
import { APIError } from "../../errors/api-error";
import { resolveMykoboCustomerForUser } from "./mykobo-customer.service";

const PROFILE_EMAIL = "user@example.com";

function stub({ profileEmail, reviewStatus }: { profileEmail: string | null; reviewStatus: string }) {
  User.findByPk = mock(async () =>
    profileEmail ? { email: profileEmail, id: "user-1" } : null
  ) as unknown as typeof User.findByPk;

  const customer = {
    status: MykoboCustomerStatus.CONSULTED,
    update: mock(async (changes: { status: MykoboCustomerStatus }) => {
      customer.status = changes.status;
    })
  };
  MykoboCustomer.findOne = mock(async () => customer) as unknown as typeof MykoboCustomer.findOne;

  MykoboApiService.getInstance = mock(() => ({
    getProfileByEmail: async () => ({
      profile: { email_address: profileEmail, kyc_status: { review_status: reviewStatus } }
    })
  })) as unknown as typeof MykoboApiService.getInstance;

  return customer;
}

describe("resolveMykoboCustomerForUser", () => {
  const originals = {
    customerFindOne: MykoboCustomer.findOne,
    getInstance: MykoboApiService.getInstance,
    userFindByPk: User.findByPk
  };

  afterEach(() => {
    User.findByPk = originals.userFindByPk;
    MykoboCustomer.findOne = originals.customerFindOne;
    MykoboApiService.getInstance = originals.getInstance;
  });

  it("derives the email from the profile and returns it when Mykobo KYC is approved", async () => {
    stub({ profileEmail: PROFILE_EMAIL, reviewStatus: "approved" });
    const result = await resolveMykoboCustomerForUser("user-1");
    expect(result.email).toBe(PROFILE_EMAIL);
  });

  it("rejects a provided email that does not match the profile", async () => {
    stub({ profileEmail: PROFILE_EMAIL, reviewStatus: "approved" });
    await expect(resolveMykoboCustomerForUser("user-1", "someone-else@example.com")).rejects.toBeInstanceOf(APIError);
  });

  it("rejects when no profile exists for the user", async () => {
    stub({ profileEmail: null, reviewStatus: "approved" });
    await expect(resolveMykoboCustomerForUser("user-1")).rejects.toBeInstanceOf(APIError);
  });

  it("rejects when Mykobo KYC is not approved", async () => {
    stub({ profileEmail: PROFILE_EMAIL, reviewStatus: "pending" });
    await expect(resolveMykoboCustomerForUser("user-1")).rejects.toBeInstanceOf(APIError);
  });
});
