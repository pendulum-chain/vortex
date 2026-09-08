import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "@/services/api/api-client";
import { shouldRetryManagedProfilesQuery } from "./useManagedProfiles";

describe("managed profile capability detection", () => {
  it("does not automatically retry client failures", () => {
    for (const status of [400, 401, 403, 404, 429]) {
      assert.equal(shouldRetryManagedProfilesQuery(0, new ApiError(status, {}, "Failed")), false);
    }
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
