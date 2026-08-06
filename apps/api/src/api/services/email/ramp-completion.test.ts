import { RampDirection } from "@vortexfi/shared";
import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { FindOptions, Op } from "sequelize";
import { SupabaseAuthService } from "../auth";
import EmailNotification from "../../../models/emailNotification.model";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState from "../../../models/rampState.model";
import { enqueueRampCompletedEmail, reconcileMissedRampCompletedEmails } from "./ramp-completion";

const realRampFindAll = RampState.findAll;
const realNotificationFindOrCreate = EmailNotification.findOrCreate;
const realQuoteFindByPk = QuoteTicket.findByPk;
const realGetUserLocale = SupabaseAuthService.getUserLocale;

afterAll(() => {
  RampState.findAll = realRampFindAll;
  EmailNotification.findOrCreate = realNotificationFindOrCreate;
  QuoteTicket.findByPk = realQuoteFindByPk;
  SupabaseAuthService.getUserLocale = realGetUserLocale;
});

const completedRamp = (id: string) =>
  ({
    id,
    phaseHistory: [{ phase: "complete", timestamp: "2026-08-01T12:30:00.000Z" }],
    quoteId: `quote-for-${id}`,
    type: RampDirection.BUY,
    updatedAt: new Date("2026-08-01T12:31:00.000Z"),
    userId: "user-1"
  }) as unknown as RampState;

// Every ramp this sweep decides is missing a notification is looked up by quote, so the
// quote lookups are exactly the set it chose to re-enqueue. Returning null stops each one
// there, keeping the test off the Supabase/locale path enqueuing would otherwise take.
let quoteLookups: string[] = [];
let rampQuery: FindOptions | undefined;

beforeEach(() => {
  quoteLookups = [];
  rampQuery = undefined;
  EmailNotification.findOrCreate = realNotificationFindOrCreate;
  SupabaseAuthService.getUserLocale = realGetUserLocale;
  QuoteTicket.findByPk = (async (quoteId: string) => {
    quoteLookups.push(quoteId);
    return null;
  }) as unknown as typeof QuoteTicket.findByPk;
});

function withMissingRamps(ids: string[]): void {
  RampState.findAll = (async (options: FindOptions) => {
    rampQuery = options;
    return ids.map(completedRamp);
  }) as unknown as typeof RampState.findAll;
}

describe("reconcileMissedRampCompletedEmails", () => {
  // The enqueue at ramp completion is not atomic with the terminal phase write, and
  // `complete` is never revisited, so a crash in between would otherwise lose the email.
  it("re-enqueues a completed ramp that never got a queue row", async () => {
    withMissingRamps(["ramp-lost"]);

    await reconcileMissedRampCompletedEmails();

    expect(quoteLookups).toEqual(["quote-for-ramp-lost"]);
  });

  it("asks the database only for ramps without a matching queue row and has no age cutoff", async () => {
    withMissingRamps([]);

    await reconcileMissedRampCompletedEmails();

    const where = rampQuery?.where as Record<string, unknown>;
    expect(where.updatedAt).toBeUndefined();
    expect((rampQuery?.where as Record<symbol, unknown>)[Op.and]).toBeDefined();
  });

  it("keeps going after one ramp fails to reconcile", async () => {
    withMissingRamps(["ramp-broken", "ramp-lost"]);
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

describe("enqueueRampCompletedEmail", () => {
  it("records when the ramp actually completed, not when a delayed enqueue runs", async () => {
    let defaults: { payload?: Record<string, unknown> } | undefined;
    SupabaseAuthService.getUserLocale = (async () => "en") as typeof SupabaseAuthService.getUserLocale;
    EmailNotification.findOrCreate = (async options => {
      defaults = options.defaults;
      return [{} as EmailNotification, true];
    }) as typeof EmailNotification.findOrCreate;
    QuoteTicket.findByPk = (async () => ({
      inputAmount: "100",
      inputCurrency: "eur",
      network: "polygon",
      outputAmount: "99",
      outputCurrency: "usdc"
    })) as unknown as typeof QuoteTicket.findByPk;

    await enqueueRampCompletedEmail(completedRamp("ramp-delayed"));

    expect(defaults?.payload?.completedAt).toBe("2026-08-01T12:30:00.000Z");
  });
});
