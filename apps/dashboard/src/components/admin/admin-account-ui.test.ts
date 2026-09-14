import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AdminAccountIdentity } from "@/services/api/admin-console.service";
import { canSelectManagedProfileDirectly, getAdminAccountLabel, toAdminImpersonationTarget } from "./admin-account-ui";

const managedAccount: AdminAccountIdentity = {
  email: null,
  id: "child-profile-id",
  kind: "managed",
  managedProfile: {
    contactEmail: "child@example.com",
    customerType: "business",
    externalSubjectId: "customer-42",
    manager: { email: "manager@example.com", isActive: true, profileId: "manager-profile-id" },
    status: "active"
  }
};

describe("admin account identity", () => {
  it("labels a managed child by contact email", () => {
    assert.equal(getAdminAccountLabel(managedAccount), "child@example.com");
  });

  it("impersonates the manager and selects the managed child", () => {
    assert.deepEqual(toAdminImpersonationTarget(managedAccount), {
      email: "manager@example.com",
      id: "manager-profile-id",
      label: "child@example.com",
      managedProfile: {
        customerType: "business",
        externalSubjectId: "customer-42",
        targetEmail: "child@example.com",
        targetProfileId: "child-profile-id"
      }
    });
  });

  it("does not offer a composed session through an inactive manager", () => {
    assert.equal(
      toAdminImpersonationTarget({
        ...managedAccount,
        managedProfile: {
          ...managedAccount.managedProfile!,
          manager: { ...managedAccount.managedProfile!.manager, isActive: false }
        }
      }),
      null
    );
  });

  it("selects directly when the operator is already the managed profile's manager", () => {
    const target = toAdminImpersonationTarget(managedAccount);
    assert.ok(target);
    assert.equal(canSelectManagedProfileDirectly(target, "manager-profile-id"), true);
    assert.equal(canSelectManagedProfileDirectly(target, "another-profile-id"), false);
  });
});
