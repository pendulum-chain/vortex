import { describe, expect, it } from "vitest";
import { rampSearchSchema } from "./searchParams";

describe("rampSearchSchema", () => {
  it("retains a recipient invite token from widget search parameters", () => {
    expect(rampSearchSchema.parse({ invite: "invite-token", kybLocked: "BR" })).toEqual({
      invite: "invite-token",
      kybLocked: "BR"
    });
  });
});
