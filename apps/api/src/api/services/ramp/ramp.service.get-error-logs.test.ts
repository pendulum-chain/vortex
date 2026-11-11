import { afterAll, describe, expect, it, mock } from "bun:test";
import { config } from "../../../config/vars";
import RampState from "../../../models/rampState.model";
import { RampService } from "./ramp.service";

const originalFindByPk = RampState.findByPk;
afterAll(() => {
  RampState.findByPk = originalFindByPk;
});

describe("RampService.getErrorLogs", () => {
  it("returns first-line messages without stacks, RPC URLs or provider bodies", async () => {
    RampState.findByPk = mock(async () => ({
      errorLogs: [
        {
          details: "Error: HTTP request failed.\n    at relayBridge (/srv/app/stock-route/execution.ts:131:7)",
          error:
            "Relay bridge: HTTP request failed. URL: https://base-mainnet.g.alchemy.com/v2/secret-key\n\nStatus: 429\nURL: https://base-mainnet.g.alchemy.com/v2/secret-key\nRequest body: {}",
          phase: "relayBridge",
          recoverable: true,
          timestamp: "2026-11-01T00:00:00.000Z"
        },
        {
          details: "stack",
          error: 'Failed to create payout ticket: Request failed with status \'400\'. Error: {"pixKey":"user@example.com"}',
          phase: "brlaPayoutOnMoonbeam",
          recoverable: false,
          timestamp: "2026-11-01T00:01:00.000Z"
        }
      ],
      flowVariant: config.flowVariant
    })) as unknown as typeof RampState.findByPk;

    const logs = await new RampService().getErrorLogs("ramp-1");

    expect(logs).toEqual([
      {
        error: "Relay bridge: HTTP request failed. URL: https://base-mainnet.g.alchemy.com/v2/[redacted]",
        phase: "relayBridge",
        recoverable: true,
        timestamp: "2026-11-01T00:00:00.000Z"
      },
      {
        error: "Failed to create payout ticket: Request failed with status '400'.",
        phase: "brlaPayoutOnMoonbeam",
        recoverable: false,
        timestamp: "2026-11-01T00:01:00.000Z"
      }
    ] as never);
  });
});
