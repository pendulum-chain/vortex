import { afterAll, describe, expect, it, mock } from "bun:test";
import { ApiManager } from "@vortexfi/shared";

let notifiersCreated = 0;

const realSlack = { ...(await import("../services/slack.service")) };
mock.module("../services/slack.service", () => ({
  ...realSlack,
  SlackNotifier: class {
    constructor() {
      notifiersCreated++;
    }
    async sendMessage(): Promise<void> {
      throw new Error("Failed to send message. Status: 429");
    }
  }
}));

const realPendulumService = { ...(await import("../services/pendulum/pendulum.service")) };
mock.module("../services/pendulum/pendulum.service", () => ({
  ...realPendulumService,
  getFundingData: () => ({ fundingAccountKeypair: { address: "funding-account" }, fundingAmountRaw: "0" })
}));

const { sendStatusWithPk } = await import("./pendulum.controller");

// Every funding balance is empty, so each status call raises every low-balance alert.
const emptyTokenAccount = { toHuman: () => ({ free: "0", frozen: "0", reserved: "0" }) };
const originalGetInstance = ApiManager.getInstance;
ApiManager.getInstance = (() => ({
  getApi: async () => ({
    api: {
      query: {
        system: { account: async () => ({ data: { free: { toString: () => "0" } } }) },
        tokens: { accounts: async () => emptyTokenAccount }
      }
    },
    decimals: 12,
    ss58Format: 56
  })
})) as unknown as typeof ApiManager.getInstance;

afterAll(() => {
  // Restore the real modules so this file's stubs don't leak into later files.
  ApiManager.getInstance = originalGetInstance;
  mock.module("../services/slack.service", () => realSlack);
  mock.module("../services/pendulum/pendulum.service", () => realPendulumService);
});

describe("Pendulum status", () => {
  it("survives Slack refusing its alerts and keeps one notifier across requests", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      expect((await sendStatusWithPk()).status).toBe(false);
      expect((await sendStatusWithPk()).status).toBe(false);
      await new Promise(resolve => setTimeout(resolve, 0));
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }

    expect(unhandled).toEqual([]);
    expect(notifiersCreated).toBe(1);
  });
});
