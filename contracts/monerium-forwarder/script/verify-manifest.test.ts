import { describe, expect, it } from "bun:test";
import { Diff, diffSection, severityFor } from "./verify-manifest";

describe("manifest diff severity", () => {
  it("treats guardian fee policy, vault and route changes as notices", () => {
    expect(severityFor("forwarders.0x123.guardianMutable.targetPpm")).toBe("NOTICE");
    expect(severityFor("forwarders.0x123.guardianMutable.floorPpm")).toBe("NOTICE");
    expect(severityFor("factory.operational.subsidyVault")).toBe("NOTICE");
    expect(severityFor("factory.operational.routes.0.enabled")).toBe("NOTICE");
  });

  it("treats the per-clone destination and registration as immutable", () => {
    expect(severityFor("forwarders.0x123.immutables.destination")).toBe("FAIL");
    expect(severityFor("forwarders.0x123.immutables.isForwarder")).toBe("FAIL");
    expect(severityFor("forwarders.0x123.runtimeBytecodeHash")).toBe("FAIL");
  });
});

describe("manifest section diff", () => {
  const routes = (enabled: boolean) => ({ routes: [{ enabled: true, path: "0xaa" }, { enabled, path: "0xbb" }] });

  it("walks route arrays by index so a same-length toggle or path change is visible", () => {
    const diffs: Diff[] = [];
    diffSection("factory.operational", routes(true), routes(false), diffs);
    expect(diffs).toEqual([
      { actual: "false", expected: "true", path: "factory.operational.routes.1.enabled", severity: "NOTICE" }
    ]);
  });

  it("reports an added route as a missing manifest entry", () => {
    const diffs: Diff[] = [];
    diffSection("factory.operational", { routes: [] }, { routes: [{ enabled: true, path: "0xaa" }] }, diffs);
    expect(diffs.map(diff => diff.path).sort()).toEqual([
      "factory.operational.routes.0.enabled",
      "factory.operational.routes.0.path"
    ]);
    expect(diffs.every(diff => diff.expected === "<missing>" && diff.severity === "NOTICE")).toBe(true);
  });
});
