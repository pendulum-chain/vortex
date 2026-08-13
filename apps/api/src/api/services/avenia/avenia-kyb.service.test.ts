import { afterEach, describe, expect, it, mock } from "bun:test";
import KycCase from "../../../models/kycCase.model";
import ProviderCustomer, { VerificationStatus } from "../../../models/providerCustomer.model";
import { getOrCreateAveniaKybCase } from "./avenia-kyb.service";

const originalFindOrCreate = KycCase.findOrCreate;

afterEach(() => {
  KycCase.findOrCreate = originalFindOrCreate;
});

describe("getOrCreateAveniaKybCase", () => {
  it("coalesces concurrent creation for one provider customer", async () => {
    let resolveCreation: ((value: [KycCase, boolean]) => void) | undefined;
    const pendingCreation = new Promise<[KycCase, boolean]>(resolve => {
      resolveCreation = resolve;
    });
    const kycCase = { id: "case-1" } as KycCase;
    const findOrCreate = mock(() => pendingCreation);
    KycCase.findOrCreate = findOrCreate as typeof KycCase.findOrCreate;
    const account = {
      customerEntityId: "entity-1",
      id: "provider-customer-1",
      status: VerificationStatus.Pending,
      statusExternal: null
    } as ProviderCustomer;

    const first = getOrCreateAveniaKybCase(account);
    const second = getOrCreateAveniaKybCase(account);
    resolveCreation?.([kycCase, true]);

    expect(await Promise.all([first, second])).toEqual([kycCase, kycCase]);
    expect(findOrCreate).toHaveBeenCalledTimes(1);
  });

  it("allows a retry after creation fails", async () => {
    const kycCase = { id: "case-1" } as KycCase;
    const findOrCreate = mock()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce([kycCase, true]);
    KycCase.findOrCreate = findOrCreate as typeof KycCase.findOrCreate;
    const account = {
      customerEntityId: "entity-1",
      id: "provider-customer-1",
      status: VerificationStatus.Pending,
      statusExternal: null
    } as ProviderCustomer;

    await expect(getOrCreateAveniaKybCase(account)).rejects.toThrow("database unavailable");
    expect(await getOrCreateAveniaKybCase(account)).toBe(kycCase);
    expect(findOrCreate).toHaveBeenCalledTimes(2);
  });
});
