import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapPendingInvitationDto, mapRecipientDto } from "./recipient.mappers";
import type { PendingInvitationDto, RecipientDto } from "./recipients.service";

function pendingInvitation(overrides: Partial<PendingInvitationDto> = {}): PendingInvitationDto {
  return {
    alias: null,
    country: "MX",
    createdAt: "2026-07-01T00:00:00Z",
    expiresAt: "2026-07-15T00:00:00Z",
    id: "invitation-1",
    inviteeEmail: null,
    inviteeType: "individual",
    isExpired: false,
    payoutCurrency: "mxn",
    rail: "mxn",
    seededDiscounts: null,
    token: null,
    ...overrides
  };
}

function recipient(overrides: Partial<RecipientDto> = {}): RecipientDto {
  return {
    createdAt: "2026-07-01T00:00:00Z",
    id: "relationship-1",
    invitation: {
      alias: null,
      country: "MX",
      id: "invitation-1",
      inviteeEmail: null,
      inviteeType: "individual",
      payoutCurrency: "mxn",
      rail: "mxn"
    },
    nickname: null,
    onboardingStatus: "pending",
    payoutReferences: [],
    recipientType: "individual",
    relationshipStatus: "active",
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

  it("carries the raw token as the re-copyable invite code", () => {
    const mapped = mapPendingInvitationDto(pendingInvitation({ token: "raw-token-123" }), "account-1");
    assert.equal(mapped?.inviteCode, "raw-token-123");
    assert.equal(mapped?.kind, "invitation");
  });

  it("maps a legacy invitation without a retained token to an empty invite code", () => {
    assert.equal(mapPendingInvitationDto(pendingInvitation(), "account-1")?.inviteCode, "");
  });

  it("labels the row with the alias when one was set", () => {
    const mapped = mapPendingInvitationDto(pendingInvitation({ alias: "Maria · MXN", inviteeEmail: "m@example.com" }), "a");
    assert.equal(mapped?.name, "Maria · MXN");
  });
});

describe("mapRecipientDto", () => {
  it("prefers the nickname over the invitation alias as the label", () => {
    const mapped = mapRecipientDto(recipient({ invitation: { ...recipient().invitation!, alias: "Maria" }, nickname: "Mom" }), "a");
    assert.equal(mapped?.name, "Mom");
    assert.equal(mapped?.kind, "relationship");
  });

  it("falls back to the invitation alias when there is no nickname", () => {
    const mapped = mapRecipientDto(recipient({ invitation: { ...recipient().invitation!, alias: "Maria" } }), "a");
    assert.equal(mapped?.name, "Maria");
  });
});
