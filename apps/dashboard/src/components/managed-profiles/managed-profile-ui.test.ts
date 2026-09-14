import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isChildModePathForbidden, toManagedProfileSelection } from "./managed-profile-ui";

describe("managed profile UI", () => {
  it("builds the persisted child selection from a profile", () => {
    assert.deepEqual(
      toManagedProfileSelection({
        contactEmail: "child@example.com",
        customerType: "business",
        externalSubjectId: "customer-42",
        profileId: "profile-42"
      }),
      {
        customerType: "business",
        externalSubjectId: "customer-42",
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
        profileId: "profile-7"
      }).targetEmail,
      "customer-7"
    );
  });

  it("blocks only manager-scoped child routes", () => {
    assert.equal(isChildModePathForbidden("/settings"), true);
    assert.equal(isChildModePathForbidden("/admin/account-id"), true);
    assert.equal(isChildModePathForbidden("/managed-profiles"), true);
    assert.equal(isChildModePathForbidden("/administration-guide"), false);
    assert.equal(isChildModePathForbidden("/transactions"), false);
  });
});
