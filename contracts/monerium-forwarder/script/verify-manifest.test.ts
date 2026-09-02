import { describe, expect, it } from "bun:test";
import { severityFor } from "./verify-manifest";

describe("manifest diff severity", () => {
  it("treats guardian fee changes as notices", () => {
    expect(severityFor("forwarders.0x123.guardianMutable.feeBps")).toBe("NOTICE");
  });

  it("keeps client changes expected and immutable changes fatal", () => {
    expect(severityFor("forwarders.0x123.clientMutable.destination")).toBe("EXPECTED-TRANSITION");
    expect(severityFor("forwarders.0x123.immutables.isForwarder")).toBe("FAIL");
    expect(severityFor("forwarders.0x123.runtimeBytecodeHash")).toBe("FAIL");
  });
});
