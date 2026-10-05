import type { RampProcess, UnsignedTx } from "@vortexfi/shared";
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MaintenanceService } from "@/services/api/maintenance.service";

mock.module("@/services/transactions/userSigning", () => ({
  signAndSubmitEvmTransaction: () => {
    throw new Error("Wallet reached in transfer actors test");
  },
  signMultipleTypedData: () => {
    throw new Error("Wallet reached in transfer actors test");
  }
}));

const { signUserTransactions } = await import("./transfer.actors");

const input = {
  ramp: { id: "ramp-sell" } as RampProcess,
  userTxs: [
    {
      network: "polygon",
      nonce: 0,
      phase: "squidRouterApprove",
      signer: "0x1111111111111111111111111111111111111111",
      txData: { data: "0x", to: "0x2222222222222222222222222222222222222222", value: "0" }
    }
  ] as unknown as UnsignedTx[]
};

async function withStatus(getStatus: typeof MaintenanceService.getStatus, run: () => Promise<void>) {
  const original = MaintenanceService.getStatus;
  MaintenanceService.getStatus = getStatus;
  try {
    await run();
  } finally {
    MaintenanceService.getStatus = original;
  }
}

describe("signUserTransactions maintenance check", () => {
  it("stops before the wallet signs when a window has opened", () =>
    withStatus(
      async () => ({
        is_maintenance_active: true,
        maintenance_details: {
          end_datetime: "2026-10-05T12:00:00.000Z",
          message: "Ramps are paused while we upgrade.",
          start_datetime: "2026-10-05T10:00:00.000Z",
          title: "Scheduled maintenance"
        }
      }),
      () => assert.rejects(signUserTransactions(input), /paused for scheduled maintenance\. Nothing was sent/)
    ));

  it("signs when no window is active", () =>
    withStatus(
      async () => ({ is_maintenance_active: false, maintenance_details: null }),
      () => assert.rejects(signUserTransactions(input), /Wallet reached/)
    ));

  it("signs when the status check fails, leaving enforcement to the API guard", () =>
    withStatus(
      async () => {
        throw new Error("network down");
      },
      () => assert.rejects(signUserTransactions(input), /Wallet reached/)
    ));
});
