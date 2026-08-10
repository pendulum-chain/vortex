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
let sendFailure: Error | null = null;

// Plain-object snapshots taken before mocking: mock.module mutates the imported
// namespaces in place, so a spread at restore time would copy the stubs back.
const realTransport = { ...(await import("./resend.transport")) };
mock.module("./resend.transport", () => ({
  ...realTransport,
  sendEmail: async (email: OutboundEmail) => {
    if (sendFailure) {
      throw sendFailure;
    }
    sends.push(email);
    return "resend-message-id";
  }
}));

const realSlack = { ...(await import("../slack.service")) };
mock.module("../slack.service", () => ({
  ...realSlack,
  SlackNotifier: class {
    async sendMessage({ text }: { text: string }): Promise<void> {
      slackAlerts.push(text);
    }
  }
}));

const realTemplates = { ...(await import("./templates")) };
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
const realDeploymentEnv = config.deploymentEnv;

afterAll(() => {
  EmailNotification.findAll = realFindAll;
  EmailNotification.update = realUpdate;
  sequelize.transaction = realTransaction;
  User.findByPk = realUserFindByPk;
  NotificationPreference.findOne = realPreferenceFindOne;
  config.integrations.resend.apiKey = realApiKey;
  config.integrations.resend.recipientAllowlist = realAllowlist;
  config.deploymentEnv = realDeploymentEnv;
  // Restore the real modules so this file's stubs don't leak into later files.
  mock.module("./resend.transport", () => realTransport);
  mock.module("../slack.service", () => realSlack);
  mock.module("./templates", () => realTemplates);
});

beforeEach(() => {
  table = [];
  sends.length = 0;
  slackAlerts.length = 0;
  preferences = null;
  sendFailure = null;

  config.deploymentEnv = "test";
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

describe("claiming", () => {
  // Both flow-variant backends dispatch against one table; dropping the transactional
  // SKIP LOCKED claim would double-send every email whenever their cycles overlap.
  it("claims inside a transaction with a row lock, SKIP LOCKED, and a bounded batch", async () => {
    const captured: Record<string, unknown>[] = [];
    const previous = EmailNotification.findAll;
    EmailNotification.findAll = (async (options: Record<string, unknown>) => {
      captured.push(options);
      return (previous as unknown as (options: Record<string, unknown>) => Promise<unknown>)(options);
    }) as unknown as typeof EmailNotification.findAll;
    row();

    await dispatchPendingNotifications();

    const claim = captured.find(options => options.lock !== undefined);
    expect(claim).toBeDefined();
    expect(claim?.skipLocked).toBe(true);
    expect(claim?.transaction).toBeDefined();
    expect(claim?.limit).toBe(25);
  });
});

describe("non-production recipient allowlist", () => {
  it("skips a recipient absent from the allowlist without calling Resend", async () => {
    config.integrations.resend.recipientAllowlist = ["someone-else@vortexfinance.co"];
    const pending = row();

    await dispatchPendingNotifications();

    expect(sends).toHaveLength(0);
    expect(pending.status).toBe(NotificationStatus.Skipped);
    expect(pending.lastError).toContain("EMAIL_RECIPIENT_ALLOWLIST");
  });

  it("skips everyone when the allowlist is empty", async () => {
    config.integrations.resend.recipientAllowlist = [];
    const pending = row();

    await dispatchPendingNotifications();

    expect(sends).toHaveLength(0);
    expect(pending.status).toBe(NotificationStatus.Skipped);
  });

  it("does not gate production sends on the allowlist", async () => {
    config.deploymentEnv = "production";
    config.integrations.resend.recipientAllowlist = [];
    const pending = row();

    await dispatchPendingNotifications();

    expect(sends).toHaveLength(1);
    expect(pending.status).toBe(NotificationStatus.Sent);
  });
});

describe("delivery failure", () => {
  it("records a failed send and schedules the first retry from the backoff table", async () => {
    sendFailure = new Error("Resend responded 500: internal error");
    const pending = row();

    const before = Date.now();
    await dispatchPendingNotifications();

    expect(pending.status).toBe(NotificationStatus.Failed);
    expect(pending.lastError).toContain("Resend responded 500");
    // First failure (attempts = 1) → next attempt one minute out.
    const delay = pending.nextAttemptAt.getTime() - before;
    expect(delay).toBeGreaterThanOrEqual(55_000);
    expect(delay).toBeLessThanOrEqual(65_000);
    expect(slackAlerts).toHaveLength(0);
  });

  it("abandons on the final failed attempt and alerts Slack", async () => {
    sendFailure = new Error("Resend responded 500: internal error");
    const last = row({ attempts: 5 });

    await dispatchPendingNotifications();

    expect(last.status).toBe(NotificationStatus.Abandoned);
    expect(slackAlerts).toHaveLength(1);
    expect(slackAlerts[0]).toContain("after 6 attempts");
  });

  it("caps the recorded error text", async () => {
    sendFailure = new Error("x".repeat(5000));
    const pending = row();

    await dispatchPendingNotifications();

    expect(pending.lastError?.length).toBeLessThanOrEqual(2000);
  });
});
