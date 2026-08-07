import { EmailNotificationType } from "@vortexfi/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CATEGORY_TYPE_KEYS,
  isCategoryEnabled,
  type NotificationPreferencesDto,
  preferencesUpdateFor
} from "./notification-preferences.service";

function dto(prefs: Record<string, unknown> = {}, emailEnabled = true): NotificationPreferencesDto {
  return { emailEnabled, prefs };
}

describe("category type keys", () => {
  // The dispatch worker consults prefs[<stored type>]; both sides consume the shared
  // EmailNotificationType enum so the strings cannot drift between workspaces.
  it("cover every stored notification type exactly once", () => {
    const mapped = Object.values(CATEGORY_TYPE_KEYS).flat().sort();
    assert.deepEqual(mapped, Object.values(EmailNotificationType).sort());
  });

  it("group verification under onboarding and ramp completion under transfers", () => {
    assert.deepEqual(CATEGORY_TYPE_KEYS.onboarding, [
      EmailNotificationType.VerificationApproved,
      EmailNotificationType.VerificationRejected,
      EmailNotificationType.VerificationExpired
    ]);
    assert.deepEqual(CATEGORY_TYPE_KEYS.transfers, [EmailNotificationType.RampCompleted]);
  });
});

describe("isCategoryEnabled", () => {
  it("treats missing keys as enabled (email is opt-out)", () => {
    assert.equal(isCategoryEnabled(dto(), "onboarding"), true);
    assert.equal(isCategoryEnabled(dto(), "transfers"), true);
  });

  it("only an explicit false mutes", () => {
    assert.equal(isCategoryEnabled(dto({ ramp_completed: true }), "transfers"), true);
    assert.equal(isCategoryEnabled(dto({ ramp_completed: false }), "transfers"), false);
  });

  it("shows a partially muted category as off", () => {
    assert.equal(isCategoryEnabled(dto({ verification_rejected: false }), "onboarding"), false);
  });

  it("shows every category as off while the master switch is off", () => {
    assert.equal(isCategoryEnabled(dto({}, false), "onboarding"), false);
    assert.equal(isCategoryEnabled(dto({}, false), "transfers"), false);
  });
});

describe("preferencesUpdateFor", () => {
  it("normally updates only prefs, setting every type of the category", () => {
    const update = preferencesUpdateFor(dto(), "onboarding", false);

    assert.equal(update.emailEnabled, undefined);
    assert.deepEqual(update.prefs, {
      verification_approved: false,
      verification_expired: false,
      verification_rejected: false
    });
  });

  it("re-enabling heals a partial mute", () => {
    const update = preferencesUpdateFor(dto({ verification_rejected: false }), "onboarding", true);

    assert.equal(isCategoryEnabled({ emailEnabled: true, prefs: update.prefs }, "onboarding"), true);
  });

  it("preserves keys it does not own", () => {
    const update = preferencesUpdateFor(dto({ ramp_completed: false, someday_a_new_type: false }), "onboarding", true);

    assert.equal(update.prefs.ramp_completed, false);
    assert.equal(update.prefs.someday_a_new_type, false);
  });

  // A profile stored with emailEnabled=false shows both categories off. Enabling one
  // must lift the master switch without silently re-enabling the other category.
  it("enabling under a global mute lifts the switch and pins other categories to muted", () => {
    const update = preferencesUpdateFor(dto({}, false), "transfers", true);

    assert.equal(update.emailEnabled, true);
    const after = { emailEnabled: true, prefs: update.prefs };
    assert.equal(isCategoryEnabled(after, "transfers"), true);
    assert.equal(isCategoryEnabled(after, "onboarding"), false);
  });

  it("disabling under a global mute leaves the switch alone", () => {
    const update = preferencesUpdateFor(dto({}, false), "transfers", false);

    assert.equal(update.emailEnabled, undefined);
    assert.equal(update.prefs.ramp_completed, false);
  });
});
