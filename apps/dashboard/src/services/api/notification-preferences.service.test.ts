import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATEGORY_TYPE_KEYS, isCategoryEnabled, prefsWithCategory } from "./notification-preferences.service";

describe("category type keys", () => {
  // The dispatch worker consults prefs[<stored type>], and the PUT endpoint accepts any
  // keys without validation — a drifted string would mute nothing, silently. These
  // literals are the wire contract with apps/api's NotificationType enum.
  it("match the stored notification type strings the API dispatches on", () => {
    assert.deepEqual(CATEGORY_TYPE_KEYS.onboarding, ["verification_approved", "verification_rejected", "verification_expired"]);
    assert.deepEqual(CATEGORY_TYPE_KEYS.transfers, ["ramp_completed"]);
  });
});

describe("isCategoryEnabled", () => {
  it("treats missing keys as enabled (email is opt-out)", () => {
    assert.equal(isCategoryEnabled({}, "onboarding"), true);
    assert.equal(isCategoryEnabled({}, "transfers"), true);
  });

  it("only an explicit false mutes", () => {
    assert.equal(isCategoryEnabled({ ramp_completed: true }, "transfers"), true);
    assert.equal(isCategoryEnabled({ ramp_completed: false }, "transfers"), false);
  });

  it("shows a partially muted category as off", () => {
    assert.equal(isCategoryEnabled({ verification_rejected: false }, "onboarding"), false);
  });
});

describe("prefsWithCategory", () => {
  it("sets every type of the category", () => {
    assert.deepEqual(prefsWithCategory({}, "onboarding", false), {
      verification_approved: false,
      verification_expired: false,
      verification_rejected: false
    });
  });

  it("re-enabling heals a partial mute", () => {
    const healed = prefsWithCategory({ verification_rejected: false }, "onboarding", true);
    assert.equal(isCategoryEnabled(healed, "onboarding"), true);
  });

  it("preserves keys it does not own", () => {
    const prefs = prefsWithCategory({ ramp_completed: false, someday_a_new_type: false }, "onboarding", true);
    assert.equal(prefs.ramp_completed, false);
    assert.equal(prefs.someday_a_new_type, false);
  });
});
