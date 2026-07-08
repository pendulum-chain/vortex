import { describe, expect, test } from "bun:test";
import { AveniaTicketStatus } from "@vortexfi/shared";
import { checkTicketStatusPaid, RetryableAveniaTicketStatusError } from "./brla.ts";

describe("checkTicketStatusPaid", () => {
  test("throws immediately for failed tickets", async () => {
    const service = {
      getAveniaSwapTicket: async () => ({
        status: AveniaTicketStatus.FAILED
      })
    };

    await expect(
      Promise.race([
        checkTicketStatusPaid(service as never, "ticket-1"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timed out waiting for terminal failure")), 25))
      ])
    ).rejects.toThrow("FAILED");
  });

  test("throws a retryable error for partial-failed tickets", async () => {
    const service = {
      getAveniaSwapTicket: async () => ({
        status: "partial-failed"
      })
    };

    await expect(
      Promise.race([
        checkTicketStatusPaid(service as never, "ticket-1"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timed out waiting for terminal failure")), 25))
      ])
    ).rejects.toBeInstanceOf(RetryableAveniaTicketStatusError);
  });
});
