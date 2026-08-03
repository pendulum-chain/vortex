import { RampDirection } from "@vortexfi/shared";
import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import EmailNotification from "../../../models/emailNotification.model";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState from "../../../models/rampState.model";
import { reconcileMissedRampCompletedEmails } from "./ramp-completion";

const realRampFindAll = RampState.findAll;
const realNotificationFindAll = EmailNotification.findAll;
const realQuoteFindByPk = QuoteTicket.findByPk;

afterAll(() => {
  RampState.findAll = realRampFindAll;
  EmailNotification.findAll = realNotificationFindAll;
  QuoteTicket.findByPk = realQuoteFindByPk;
});

const completedRamp = (id: string) =>
  ({ id, quoteId: `quote-for-${id}`, type: RampDirection.BUY, userId: "user-1" }) as unknown as RampState;

// Every ramp this sweep decides is missing a notification is looked up by quote, so the
// quote lookups are exactly the set it chose to re-enqueue. Returning null stops each one
// there, keeping the test off the Supabase/locale path enqueuing would otherwise take.
let quoteLookups: string[] = [];

beforeEach(() => {
  quoteLookups = [];
  QuoteTicket.findByPk = (async (quoteId: string) => {
    quoteLookups.push(quoteId);
    return null;
  }) as unknown as typeof QuoteTicket.findByPk;
});

function withRamps(ids: string[], alreadyQueued: string[]): void {
  RampState.findAll = (async () => ids.map(completedRamp)) as unknown as typeof RampState.findAll;
  EmailNotification.findAll = (async () =>
    alreadyQueued.map(resourceId => ({ resourceId }))) as unknown as typeof EmailNotification.findAll;
}

describe("reconcileMissedRampCompletedEmails", () => {
  // The enqueue at ramp completion is not atomic with the terminal phase write, and
  // `complete` is never revisited, so a crash in between would otherwise lose the email.
  it("re-enqueues a completed ramp that never got a queue row", async () => {
    withRamps(["ramp-lost"], []);

    await reconcileMissedRampCompletedEmails();

    expect(quoteLookups).toEqual(["quote-for-ramp-lost"]);
  });

  it("leaves ramps the inline enqueue already queued alone", async () => {
    withRamps(["ramp-queued", "ramp-lost"], ["ramp-queued"]);

    await reconcileMissedRampCompletedEmails();

    expect(quoteLookups).toEqual(["quote-for-ramp-lost"]);
  });

  it("does nothing when every completed ramp is already queued", async () => {
    withRamps(["ramp-a", "ramp-b"], ["ramp-a", "ramp-b"]);

    await reconcileMissedRampCompletedEmails();

    expect(quoteLookups).toEqual([]);
  });

  it("keeps going after one ramp fails to reconcile", async () => {
    withRamps(["ramp-broken", "ramp-lost"], []);
    QuoteTicket.findByPk = (async (quoteId: string) => {
      quoteLookups.push(quoteId);
      if (quoteId === "quote-for-ramp-broken") {
        throw new Error("quote read failed");
      }
      return null;
    }) as unknown as typeof QuoteTicket.findByPk;

    await reconcileMissedRampCompletedEmails();

    expect(quoteLookups).toEqual(["quote-for-ramp-broken", "quote-for-ramp-lost"]);
  });
});
