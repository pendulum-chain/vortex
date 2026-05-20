import {afterEach, describe, expect, it, mock} from "bun:test";
import Partner from "../../models/partner.model";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import {assertQuoteOwnership, assertRampOwnership} from "./ownershipAuth";

describe("assertQuoteOwnership", () => {
  const originalFindByPk = QuoteTicket.findByPk;
  const originalPartnerFindByPk = Partner.findByPk;

  afterEach(() => {
    QuoteTicket.findByPk = originalFindByPk;
    Partner.findByPk = originalPartnerFindByPk;
  });

  it("rejects a Supabase user registering another user's quote", async () => {
    QuoteTicket.findByPk = mock(async () => ({
      partnerId: null,
      userId: "victim-user"
    })) as typeof QuoteTicket.findByPk;

    await expect(assertQuoteOwnership({ userId: "attacker-user" }, "quote-1")).rejects.toThrow(
      "Authenticated user does not own this quote"
    );
  });

  it("allows a Supabase user registering their own quote", async () => {
    QuoteTicket.findByPk = mock(async () => ({
      partnerId: null,
      userId: "user-1"
    })) as typeof QuoteTicket.findByPk;

    await expect(assertQuoteOwnership({ userId: "user-1" }, "quote-1")).resolves.toBeUndefined();
  });

  it("allows an authenticated user to claim an anonymous non-partner quote", async () => {
    QuoteTicket.findByPk = mock(async () => ({
      partnerId: null,
      userId: null
    })) as typeof QuoteTicket.findByPk;

    await expect(assertQuoteOwnership({ userId: "user-1" }, "quote-1")).resolves.toBeUndefined();
  });

  it("allows partner API keys to access quotes owned by another active partner row with the same name", async () => {
    QuoteTicket.findByPk = mock(async () => ({
      partnerId: "quote-partner-id",
      userId: null
    })) as typeof QuoteTicket.findByPk;
    Partner.findByPk = mock(async () => ({
      id: "quote-partner-id",
      name: "Partner"
    })) as typeof Partner.findByPk;

    await expect(
      assertQuoteOwnership({ authenticatedPartner: { id: "api-key-partner-id", name: "Partner" } }, "quote-1")
    ).resolves.toBeUndefined();
  });

  it("allows an anonymous caller to register a fully-anonymous quote", async () => {
    QuoteTicket.findByPk = mock(async () => ({
      partnerId: null,
      userId: null
    })) as typeof QuoteTicket.findByPk;

    await expect(assertQuoteOwnership({}, "quote-1")).resolves.toBeUndefined();
  });

  it("rejects an anonymous caller from registering a user-owned quote", async () => {
    QuoteTicket.findByPk = mock(async () => ({
      partnerId: null,
      userId: "user-1"
    })) as typeof QuoteTicket.findByPk;

    await expect(assertQuoteOwnership({}, "quote-1")).rejects.toThrow("Authentication required");
  });

  it("rejects an anonymous caller from registering a partner-owned quote", async () => {
    QuoteTicket.findByPk = mock(async () => ({
      partnerId: "partner-id",
      userId: null
    })) as typeof QuoteTicket.findByPk;

    await expect(assertQuoteOwnership({}, "quote-1")).rejects.toThrow("Authentication required");
  });
});

describe("assertRampOwnership", () => {
  const originalRampFindByPk = RampState.findByPk;
  const originalQuoteFindByPk = QuoteTicket.findByPk;

  afterEach(() => {
    RampState.findByPk = originalRampFindByPk;
    QuoteTicket.findByPk = originalQuoteFindByPk;
  });

  it("allows an anonymous caller to access a fully-anonymous ramp", async () => {
    RampState.findByPk = mock(async () => ({
      quoteId: "quote-1",
      userId: null
    })) as typeof RampState.findByPk;
    QuoteTicket.findByPk = mock(async () => ({
      partnerId: null,
      userId: null
    })) as typeof QuoteTicket.findByPk;

    await expect(assertRampOwnership({}, "ramp-1")).resolves.toBeUndefined();
  });

  it("rejects an anonymous caller from accessing a user-owned ramp", async () => {
    RampState.findByPk = mock(async () => ({
      quoteId: "quote-1",
      userId: "user-1"
    })) as typeof RampState.findByPk;

    await expect(assertRampOwnership({}, "ramp-1")).rejects.toThrow("Authentication required");
  });

  it("rejects an anonymous caller from accessing a ramp whose source quote has a partner owner", async () => {
    RampState.findByPk = mock(async () => ({
      quoteId: "quote-1",
      userId: null
    })) as typeof RampState.findByPk;
    QuoteTicket.findByPk = mock(async () => ({
      partnerId: "partner-id",
      userId: null
    })) as typeof QuoteTicket.findByPk;

    await expect(assertRampOwnership({}, "ramp-1")).rejects.toThrow("Authentication required");
  });
});
