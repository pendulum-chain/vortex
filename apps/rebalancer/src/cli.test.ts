import { describe, expect, it } from "bun:test";
import { assertLegacyRebalancerDisabled, LEGACY_REBALANCER_DISABLED_MESSAGE } from "./cli";

describe("rebalancer CLI", () => {
  it("rejects the retired legacy Moonbeam flow", () => {
    expect(() => assertLegacyRebalancerDisabled(["100", "--legacy"])).toThrow(LEGACY_REBALANCER_DISABLED_MESSAGE);
  });

  it("allows the current Base flow arguments", () => {
    expect(() => assertLegacyRebalancerDisabled(["100", "--restart", "--route=avenia"])).not.toThrow();
  });

  it("exits before runtime configuration or chain work", async () => {
    const child = Bun.spawn(["bun", "index.ts", "--legacy"], {
      cwd: import.meta.dir,
      stderr: "pipe",
      stdout: "pipe"
    });
    const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain(LEGACY_REBALANCER_DISABLED_MESSAGE);
  });
});
