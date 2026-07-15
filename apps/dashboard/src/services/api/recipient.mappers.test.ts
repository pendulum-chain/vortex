import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapPendingInvitationDto } from "./recipient.mappers";
import type { PendingInvitationDto } from "./recipients.service";

function pendingInvitation(overrides: Partial<PendingInvitationDto> = {}): PendingInvitationDto {
  return {
    country: "MX",
    createdAt: "2026-07-01T00:00:00Z",
    expiresAt: "2026-07-15T00:00:00Z",
    id: "invitation-1",
    inviteeEmail: null,
    inviteeType: "individual",
    isExpired: false,
    payoutCurrency: "mxn",
    rail: "mxn",
    ...overrides
  };
}

describe("mapPendingInvitationDto", () => {
  it("maps a live pending invitation to invite_sent", () => {
    assert.equal(mapPendingInvitationDto(pendingInvitation(), "account-1")?.status, "invite_sent");
  });

  it("maps an expired pending invitation to expired, not rejected", () => {
    assert.equal(mapPendingInvitationDto(pendingInvitation({ isExpired: true }), "account-1")?.status, "expired");
  });
});
