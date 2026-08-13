import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "@/services/api/api-client";
import { isManagedProfilesAccessDenied, shouldRetryManagedProfilesQuery } from "./useManagedProfiles";

describe("managed profile capability detection", () => {
  it("recognizes only the exact access-denied response as non-manager capability", () => {
    const denied = new ApiError(403, { code: "MANAGED_PROFILE_ACCESS_DENIED" }, "Denied");
    const transientForbidden = new ApiError(403, { code: "UPSTREAM_UNAVAILABLE" }, "Unavailable");

    assert.equal(isManagedProfilesAccessDenied(denied), true);
    assert.equal(isManagedProfilesAccessDenied(transientForbidden), false);
    assert.equal(isManagedProfilesAccessDenied(new Error("Network failure")), false);
  });

  it("retries transient failures but not definitive access denial", () => {
    const denied = new ApiError(403, { code: "MANAGED_PROFILE_ACCESS_DENIED" }, "Denied");
    const serverError = new ApiError(503, {}, "Unavailable");

    assert.equal(shouldRetryManagedProfilesQuery(0, denied), false);
    assert.equal(shouldRetryManagedProfilesQuery(0, serverError), true);
    assert.equal(shouldRetryManagedProfilesQuery(1, new Error("Network failure")), true);
    assert.equal(shouldRetryManagedProfilesQuery(2, serverError), false);
  });
});
