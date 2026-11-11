import { Networks } from "@vortexfi/shared";
import { describe, expect, it } from "vitest";
import { isFrontendNetworkEnabled } from "./networkAvailability";

describe("isFrontendNetworkEnabled", () => {
  it("keeps Robinhood Chain out of the widget, so URL and stored values fall back", () => {
    expect(isFrontendNetworkEnabled(Networks.Robinhood)).toBe(false);
    expect(isFrontendNetworkEnabled("ROBINHOOD")).toBe(false);
    expect(isFrontendNetworkEnabled(Networks.Base)).toBe(true);
  });
});
