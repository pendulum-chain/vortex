import { afterEach, describe, expect, it } from "bun:test";
import { getAnchorPayoutMaxRetries, isAnchorMockingEnabled } from "../phases/anchor-test-mode";

const originalNodeEnv = process.env.NODE_ENV;
const originalMockMode = process.env.MOCK_ANCHOR_OPERATIONS;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalMockMode === undefined) delete process.env.MOCK_ANCHOR_OPERATIONS;
  else process.env.MOCK_ANCHOR_OPERATIONS = originalMockMode;
});

describe("anchor operation test mode", () => {
  it("enables mocked mints and disables payout retries in development", () => {
    process.env.NODE_ENV = "development";
    process.env.MOCK_ANCHOR_OPERATIONS = "true";

    expect(isAnchorMockingEnabled()).toBe(true);
    expect(getAnchorPayoutMaxRetries()).toBe(0);
  });

  it("ignores mocked anchor operations outside development", () => {
    process.env.NODE_ENV = "test";
    process.env.MOCK_ANCHOR_OPERATIONS = "true";

    expect(isAnchorMockingEnabled()).toBe(false);
    expect(getAnchorPayoutMaxRetries()).toBe(8);
  });
});
