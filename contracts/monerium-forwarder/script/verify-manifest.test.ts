import { describe, expect, it } from "bun:test";
import { severityFor } from "./verify-manifest";

describe("manifest diff severity", () => {
  it("treats guardian fee policy, vault and route changes as notices", () => {
    expect(severityFor("forwarders.0x123.guardianMutable.targetPpm")).toBe("NOTICE");
    expect(severityFor("forwarders.0x123.guardianMutable.floorPpm")).toBe("NOTICE");
    expect(severityFor("factory.operational.subsidyVault")).toBe("NOTICE");
    expect(severityFor("factory.operational.routes.0.enabled")).toBe("NOTICE");
  });

  it("keeps client changes expected and immutable changes fatal", () => {
    expect(severityFor("forwarders.0x123.clientMutable.destination")).toBe("EXPECTED-TRANSITION");
    expect(severityFor("forwarders.0x123.immutables.isForwarder")).toBe("FAIL");
    expect(severityFor("forwarders.0x123.runtimeBytecodeHash")).toBe("FAIL");
  });
});
