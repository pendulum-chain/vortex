import { describe, expect, it } from "bun:test";
import { formatLogEntry } from "./logger";

describe("formatLogEntry", () => {
  it("includes structured metadata in the rendered log line", () => {
    const line = formatLogEntry({
      destinationNetwork: "arbitrum",
      expectedAmountRaw: "772703",
      level: "info",
      message: "SQUIDROUTER_DELIVERY_EVIDENCE",
      rampId: "ramp-123",
      timestamp: "Jul 30, 2026 12:00:00"
    });

    expect(line).toContain("SQUIDROUTER_DELIVERY_EVIDENCE");
    expect(line).toContain(
      '{"destinationNetwork":"arbitrum","expectedAmountRaw":"772703","rampId":"ramp-123"}'
    );
  });

  it("keeps metadata serialization safe for bigint and circular values", () => {
    const circular: Record<string, unknown> = { amount: 772703n };
    circular.self = circular;

    const line = formatLogEntry({
      evidence: circular,
      level: "info",
      message: "EVIDENCE"
    });

    expect(line).toContain('"amount":"772703"');
    expect(line).toContain('"self":"[Circular]"');
  });

  it("does not add a metadata suffix when no metadata was provided", () => {
    expect(formatLogEntry({ level: "info", message: "Application started" })).toBe(" info Application started");
  });

  it("redacts Alchemy credentials from messages and metadata", () => {
    const credential = "test-api-key";
    const rpcUrl = `https://polygon-mainnet.g.alchemy.com/v2/${credential}`;
    const line = formatLogEntry({
      error: { rpcUrl },
      level: "error",
      message: `RPC Request failed.\nURL: ${rpcUrl}`
    });

    expect(line).toContain("https://polygon-mainnet.g.alchemy.com/v2/[redacted]");
    expect(line).not.toContain(credential);
  });
});
