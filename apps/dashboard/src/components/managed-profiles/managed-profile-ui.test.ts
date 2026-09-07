import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAccessManagedProfiles, isChildModePathForbidden, toManagedProfileSelection } from "./managed-profile-ui";

describe("managed profile UI", () => {
  it("uses explicit actor navigation flags, not actor existence or paginated rows", () => {
    assert.equal(canAccessManagedProfiles(undefined), false);
    for (const canProvisionManagedProfiles of [false, true]) {
      for (const hasMemberships of [false, true]) {
        assert.equal(
          canAccessManagedProfiles({ canProvisionManagedProfiles, hasMemberships, profileId: "actor" }),
          canProvisionManagedProfiles || hasMemberships
        );
      }
    }
  });
  it("builds the persisted child selection from a profile", () => {
    assert.deepEqual(
      toManagedProfileSelection({
        contactEmail: "child@example.com",
        customerType: "business",
        externalSubjectId: "customer-42",
        membership: { isOwner: true, role: "manager" },
        policy: { allowedCorridors: ["BR"], allowedCustomerTypes: null },
        profileId: "profile-42",
        status: "active"
      }),
      {
        customerType: "business",
        externalSubjectId: "customer-42",
        isOwner: true,
        membershipRole: "manager",
        targetEmail: "child@example.com",
        targetProfileId: "profile-42"
      }
    );
  });

  it("uses the external subject when contact email is unavailable", () => {
    assert.equal(
      toManagedProfileSelection({
        contactEmail: null,
        customerType: "individual",
        externalSubjectId: "customer-7",
        membership: { isOwner: false, role: "read_only" },
        policy: { allowedCorridors: ["MX"], allowedCustomerTypes: ["individual"] },
        profileId: "profile-7",
        status: "active"
      }).targetEmail,
      "customer-7"
    );
  });

  it("blocks only manager-scoped child routes", () => {
    assert.equal(isChildModePathForbidden("/settings"), true);
    assert.equal(isChildModePathForbidden("/admin/account-id"), true);
    assert.equal(isChildModePathForbidden("/managed-profiles"), true);
    assert.equal(isChildModePathForbidden("/transfer"), true);
    assert.equal(isChildModePathForbidden("/api-keys"), false);
    assert.equal(isChildModePathForbidden("/administration-guide"), false);
    assert.equal(isChildModePathForbidden("/transactions"), false);
  });
});
