import {afterEach, describe, expect, it, mock} from "bun:test";
import QuoteTicket from "../../models/quoteTicket.model";
import RampState from "../../models/rampState.model";
import {assertQuoteOwnership, assertRampOwnership} from "./ownershipAuth";

describe("assertQuoteOwnership", () => {
  const originalFindByPk = QuoteTicket.findByPk;

  afterEach(() => {
    QuoteTicket.findByPk = originalFindByPk;
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
      pricingPartnerId: null,
      userId: "user-1"
    })) as typeof QuoteTicket.findByPk;

    await expect(assertQuoteOwnership({ userId: "user-1" }, "quote-1")).resolves.toBeUndefined();
  });

  it("allows a Supabase user registering their own profile-priced quote", async () => {
    QuoteTicket.findByPk = mock(async () => ({
      partnerId: null,
      pricingPartnerId: "pricing-partner-id",
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

  it("rejects a credential whose canonical partner ID does not own the quote", async () => {
    QuoteTicket.findByPk = mock(async () => ({
      partnerId: "quote-partner-id",
      userId: null
    })) as typeof QuoteTicket.findByPk;

    await expect(
      assertQuoteOwnership(
        {
          credential: {
            credentialId: "credential-1",
            environment: "test",
            partnerId: "api-key-partner-id",
            profileId: "profile-1",
            strength: "secret"
          },
          authenticatedPartner: { id: "api-key-partner-id", name: "Partner" }
        } as never,
        "quote-1"
      )
    ).rejects.toThrow("Authenticated partner does not own this quote");
  });

  it("rejects secret credential B from registering a quote created with public credential A", async () => {
    QuoteTicket.findByPk = mock(async () => ({
      apiCredentialId: "credential-a",
      partnerId: "partner-id",
      userId: "profile-id"
    })) as typeof QuoteTicket.findByPk;

    await expect(
      assertQuoteOwnership(
        {
          credential: {
            credentialId: "credential-b",
            environment: "test",
            partnerId: "partner-id",
            profileId: "profile-id",
            strength: "secret"
          }
        },
        "quote-1"
      )
    ).rejects.toThrow("Secret credential does not match the credential used to create this quote");
  });

  it("allows secret credential A to register a quote created with public credential A", async () => {
    QuoteTicket.findByPk = mock(async () => ({
      apiCredentialId: "credential-a",
      partnerId: "partner-id",
      userId: "profile-id"
    })) as typeof QuoteTicket.findByPk;

    await expect(
      assertQuoteOwnership(
        {
          credential: {
            credentialId: "credential-a",
            environment: "test",
            partnerId: "partner-id",
            profileId: "profile-id",
            strength: "secret"
          }
        },
        "quote-1"
      )
    ).resolves.toBeUndefined();
  });

  it("allows the owning Supabase profile regardless of the quote credential ID", async () => {
    QuoteTicket.findByPk = mock(async () => ({
      apiCredentialId: "credential-a",
      partnerId: null,
      userId: "profile-id"
    })) as typeof QuoteTicket.findByPk;

    await expect(assertQuoteOwnership({ userId: "profile-id" }, "quote-1")).resolves.toBeUndefined();
  });

  it("allows a manager credential to register its managed child's quote", async () => {
    QuoteTicket.findByPk = mock(async () => ({
      apiCredentialId: "credential-a",
      partnerId: null,
      userId: "managed-user"
    })) as typeof QuoteTicket.findByPk;

    await expect(
      assertQuoteOwnership(
        {
          credential: {
            credentialId: "credential-a",
            environment: "test",
            partnerId: "manager-partner",
            profileId: "manager-user",
            strength: "secret"
          },
          managedProfileContext: {
            actorProfileId: "manager-user",
            controllingManagerProfileId: "manager-user",
            customerEntityId: "entity-1",
            managedProfileId: "relationship-1",
            subjectProfileId: "managed-user"
          }
        },
        "quote-1"
      )
    ).resolves.toBeUndefined();
  });

  it("rejects a manager operating on a quote owned by another child", async () => {
    QuoteTicket.findByPk = mock(async () => ({
      partnerId: null,
      userId: "other-managed-user"
    })) as typeof QuoteTicket.findByPk;

    await expect(
      assertQuoteOwnership(
        {
          managedProfileContext: {
            actorProfileId: "manager-user",
            controllingManagerProfileId: "manager-user",
            customerEntityId: "entity-1",
            managedProfileId: "relationship-1",
            subjectProfileId: "managed-user"
          },
          userId: "manager-user"
        },
        "quote-1"
      )
    ).rejects.toThrow("Managed profile does not own this quote");
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

  it("rejects a linked API key from operating on another linked user's provider-bound quote", async () => {
    QuoteTicket.findByPk = mock(async () => ({
      partnerId: "quote-partner-id",
      userId: "victim-user"
    })) as typeof QuoteTicket.findByPk;

    await expect(
      assertQuoteOwnership(
        {
          credential: {
            credentialId: "credential-1",
            environment: "test",
            partnerId: "quote-partner-id",
            profileId: "attacker-user",
            strength: "secret"
          },
          apiKeyUserId: "attacker-user",
          authenticatedPartner: {id: "api-key-partner-id", name: "Partner"}
        } as never,
        "quote-1"
      )
    ).rejects.toThrow("Authenticated profile does not own this quote");
  });

  it("allows a linked API key to operate on its own user's provider-bound quote", async () => {
    QuoteTicket.findByPk = mock(async () => ({
      partnerId: "quote-partner-id",
      userId: "user-1"
    })) as typeof QuoteTicket.findByPk;

    await expect(
      assertQuoteOwnership(
        {
          credential: {
            credentialId: "credential-1",
            environment: "test",
            partnerId: "quote-partner-id",
            profileId: "user-1",
            strength: "secret"
          },
          apiKeyUserId: "stale-user",
          authenticatedPartner: {id: "api-key-partner-id", name: "Partner"}
        } as never,
        "quote-1"
      )
    ).resolves.toBeUndefined();
  });

  it("allows a canonical partner credential to operate on a partner-owned anonymous-user quote", async () => {
    QuoteTicket.findByPk = mock(async () => ({
      partnerId: "quote-partner-id",
      userId: null
    })) as typeof QuoteTicket.findByPk;
    await expect(
      assertQuoteOwnership(
        {
          credential: {
            credentialId: "credential-1",
            environment: "test",
            partnerId: "quote-partner-id",
            profileId: "profile-1",
            strength: "secret"
          },
          authenticatedPartner: {id: "api-key-partner-id", name: "Partner"}
        } as never,
        "quote-1"
      )
    ).resolves.toBeUndefined();
  });

  it("prefers the Supabase profile over the credential profile for linked quote ownership", async () => {
    QuoteTicket.findByPk = mock(async () => ({
      partnerId: "quote-partner-id",
      userId: "supabase-user"
    })) as typeof QuoteTicket.findByPk;

    await expect(
      assertQuoteOwnership(
        {
          credential: {
            credentialId: "credential-1",
            environment: "test",
            partnerId: "quote-partner-id",
            profileId: "credential-profile",
            strength: "secret"
          },
          userId: "supabase-user"
        },
        "quote-1"
      )
    ).resolves.toBeUndefined();
  });
});

describe("assertRampOwnership", () => {
  const originalRampFindByPk = RampState.findByPk;
  const originalQuoteFindByPk = QuoteTicket.findByPk;

  afterEach(() => {
    RampState.findByPk = originalRampFindByPk;
    QuoteTicket.findByPk = originalQuoteFindByPk;
  });

  it("allows a manager to operate on its managed child's ramp", async () => {
    RampState.findByPk = mock(async () => ({
      quoteId: "quote-1",
      userId: "managed-user"
    })) as typeof RampState.findByPk;

    await expect(
      assertRampOwnership(
        {
          managedProfileContext: {
            actorProfileId: "manager-user",
            controllingManagerProfileId: "manager-user",
            customerEntityId: "entity-1",
            managedProfileId: "relationship-1",
            subjectProfileId: "managed-user"
          },
          userId: "manager-user"
        },
        "ramp-1"
      )
    ).resolves.toBeUndefined();
  });

  it("rejects a manager operating on another child's ramp", async () => {
    RampState.findByPk = mock(async () => ({
      quoteId: "quote-1",
      userId: "other-managed-user"
    })) as typeof RampState.findByPk;

    await expect(
      assertRampOwnership(
        {
          managedProfileContext: {
            actorProfileId: "manager-user",
            controllingManagerProfileId: "manager-user",
            customerEntityId: "entity-1",
            managedProfileId: "relationship-1",
            subjectProfileId: "managed-user"
          },
          userId: "manager-user"
        },
        "ramp-1"
      )
    ).rejects.toThrow("Managed profile does not own this ramp");
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
