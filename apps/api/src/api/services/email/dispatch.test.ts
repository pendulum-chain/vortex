import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { Op } from "sequelize";
import sequelize from "../../../config/database";
import { config } from "../../../config/vars";
import EmailNotification, {
  NotificationProvider,
  NotificationStatus,
  NotificationType
} from "../../../models/emailNotification.model";
import NotificationPreference from "../../../models/notificationPreference.model";
import User from "../../../models/user.model";
import { OutboundEmail } from "./resend.transport";

const RECIPIENT = "dispatch-test@vortexfinance.co";

const sends: OutboundEmail[] = [];
const slackAlerts: string[] = [];

// Only the outbound edges are replaced: the transport, the Slack alert, and template
// rendering. The claim/retry/abandon logic under test runs for real against the in-memory
// table below. mock.module is process-global, so each real module is spread back in.
const realTransport = await import("./resend.transport");
mock.module("./resend.transport", () => ({
  ...realTransport,
  sendEmail: async (email: OutboundEmail) => {
    sends.push(email);
    return "resend-message-id";
  }
}));

const realSlack = await import("../slack.service");
mock.module("../slack.service", () => ({
  ...realSlack,
  SlackNotifier: class {
    async sendMessage({ text }: { text: string }): Promise<void> {
      slackAlerts.push(text);
    }
  }
}));

const realTemplates = await import("./templates");
mock.module("./templates", () => ({
  ...realTemplates,
  renderNotification: () => ({ html: "<p>body</p>", subject: "subject", text: "body" })
}));

const { dispatchPendingNotifications } = await import("./notification.service");

interface FakeRow {
  id: string;
  attempts: number;
  status: NotificationStatus;
  type: NotificationType;
  provider: NotificationProvider;
  resourceId: string;
  userId: string;
  lastError: string | null;
  nextAttemptAt: Date;
  updatedAt: Date;
  update(values: Partial<FakeRow>): Promise<void>;
}

let table: FakeRow[] = [];
let preferences: { emailEnabled: boolean; prefs: Record<string, unknown> } | null = null;

const HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000);

function row(overrides: Partial<FakeRow> = {}): FakeRow {
  const record: FakeRow = {
    attempts: 0,
    id: "notification-1",
    lastError: null,
    nextAttemptAt: HOUR_AGO,
    provider: NotificationProvider.Vortex,
    resourceId: "ramp-1",
    status: NotificationStatus.Pending,
    type: NotificationType.RampCompleted,
    updatedAt: HOUR_AGO,
    userId: "user-1",
    async update(values: Partial<FakeRow>) {
      Object.assign(record, values);
    },
    ...overrides
  };
  table.push(record);
  return record;
}

/** Supports only the operators the dispatcher actually issues. */
function satisfies(value: unknown, condition: unknown): boolean {
  if (condition === null || typeof condition !== "object" || condition instanceof Date) {
    return value === condition;
  }

  const ops = condition as Record<symbol, unknown>;

  if (Op.lt in ops) return (value as number) < (ops[Op.lt] as number);
  if (Op.lte in ops) return (value as number) <= (ops[Op.lte] as number);
  if (Op.gte in ops) return (value as number) >= (ops[Op.gte] as number);
  if (Op.in in ops) return (ops[Op.in] as unknown[]).includes(value);

  throw new Error(`Unsupported operator in the email dispatch test double: ${String(condition)}`);
}

function findMatching(where: Record<string, unknown>): FakeRow[] {
  return table.filter(record =>
    Object.keys(where).every(field => satisfies((record as unknown as Record<string, unknown>)[field], where[field]))
  );
}

const realFindAll = EmailNotification.findAll;
const realUpdate = EmailNotification.update;
const realTransaction = sequelize.transaction;
const realUserFindByPk = User.findByPk;
const realPreferenceFindOne = NotificationPreference.findOne;
const realApiKey = config.integrations.resend.apiKey;
const realAllowlist = config.integrations.resend.recipientAllowlist;

afterAll(() => {
  EmailNotification.findAll = realFindAll;
  EmailNotification.update = realUpdate;
  sequelize.transaction = realTransaction;
  User.findByPk = realUserFindByPk;
  NotificationPreference.findOne = realPreferenceFindOne;
  config.integrations.resend.apiKey = realApiKey;
  config.integrations.resend.recipientAllowlist = realAllowlist;
  // Restore the real modules so this file's stubs don't leak into later files.
  mock.module("./resend.transport", () => ({ ...realTransport }));
  mock.module("../slack.service", () => ({ ...realSlack }));
  mock.module("./templates", () => ({ ...realTemplates }));
});

beforeEach(() => {
  table = [];
  sends.length = 0;
  slackAlerts.length = 0;
  preferences = null;

  config.integrations.resend.apiKey = "re_test_key";
  config.integrations.resend.recipientAllowlist = [RECIPIENT];

  EmailNotification.findAll = (async ({ where }: { where: Record<string, unknown> }) =>
    findMatching(where)) as unknown as typeof EmailNotification.findAll;

  EmailNotification.update = (async (values: Record<string, unknown>, { where }: { where: Record<string, unknown> }) => {
    for (const record of findMatching(where)) {
      for (const [field, value] of Object.entries(values)) {
        // `attempts` is only ever written as literal("attempts + 1") at claim time, and
        // the claim applies that increment to the instances it returns — which are these
        // same objects — so applying it here too would count it twice.
        if (field === "attempts") continue;
        (record as unknown as Record<string, unknown>)[field] = value;
      }
      record.updatedAt = new Date();
    }
    return [findMatching(where).length];
  }) as unknown as typeof EmailNotification.update;

  sequelize.transaction = (async (callback: (t: unknown) => Promise<unknown>) =>
    callback({ LOCK: { UPDATE: "UPDATE" } })) as unknown as typeof sequelize.transaction;

  User.findByPk = (async () => ({ email: RECIPIENT })) as unknown as typeof User.findByPk;
  NotificationPreference.findOne = (async () => preferences) as unknown as typeof NotificationPreference.findOne;
});

describe("dispatchPendingNotifications", () => {
  it("sends a due notification and records it as sent", async () => {
    const pending = row();

    await dispatchPendingNotifications();

    expect(sends).toHaveLength(1);
    expect(sends[0].to).toBe(RECIPIENT);
    expect(pending.status).toBe(NotificationStatus.Sent);
  });

  // A crash after Resend accepts but before `sent` is persisted returns the row to the
  // queue. Without a stable key the retry is a second email, not a replay of the first.
  it("keys the send on the queue row so an uncertain retry cannot double-send", async () => {
    row({ id: "notification-abc" });

    await dispatchPendingNotifications();

    expect(sends[0].idempotencyKey).toBe("notification-abc");
  });
});

describe("recipient preferences", () => {
  it("skips a recipient who has disabled email entirely", async () => {
    preferences = { emailEnabled: false, prefs: {} };
    const pending = row();

    await dispatchPendingNotifications();

    expect(sends).toHaveLength(0);
    expect(pending.status).toBe(NotificationStatus.Skipped);
  });

  it("skips only the notification type the recipient turned off", async () => {
    preferences = { emailEnabled: true, prefs: { [NotificationType.RampCompleted]: false } };
    const muted = row({ id: "muted", type: NotificationType.RampCompleted });
    const allowed = row({ id: "allowed", resourceId: "attempt-1", type: NotificationType.VerificationApproved });

    await dispatchPendingNotifications();

    expect(muted.status).toBe(NotificationStatus.Skipped);
    expect(allowed.status).toBe(NotificationStatus.Sent);
    expect(sends).toHaveLength(1);
  });

  it("treats a recipient with no preferences row as opted in", async () => {
    preferences = null;
    row();

    await dispatchPendingNotifications();

    expect(sends).toHaveLength(1);
  });
});

describe("stale claim recovery", () => {
  const staleSending = (attempts: number) =>
    row({
      attempts,
      status: NotificationStatus.Sending,
      updatedAt: new Date(Date.now() - 20 * 60 * 1000)
    });

  it("requeues a stale claim that still has attempts left", async () => {
    const stalled = staleSending(2);

    await dispatchPendingNotifications();

    expect(stalled.status).toBe(NotificationStatus.Sent);
    expect(stalled.attempts).toBe(3);
    expect(slackAlerts).toHaveLength(0);
  });

  // A process dying between claim and resolution records no failure, so the cap
  // handleDeliveryFailure applies never runs. Requeuing unconditionally let a crash loop
  // resend forever instead of abandoning at the cap.
  it("abandons a stale claim that has spent its attempts instead of requeuing it", async () => {
    const exhausted = staleSending(6);

    await dispatchPendingNotifications();

    expect(exhausted.status).toBe(NotificationStatus.Abandoned);
    expect(sends).toHaveLength(0);
    expect(slackAlerts).toHaveLength(1);
    expect(slackAlerts[0]).toContain("after 6 attempts");
  });

  it("never claims a row that is already at the attempt cap", async () => {
    const spent = row({ attempts: 6, status: NotificationStatus.Failed });

    await dispatchPendingNotifications();

    expect(spent.attempts).toBe(6);
    expect(sends).toHaveLength(0);
  });
});
