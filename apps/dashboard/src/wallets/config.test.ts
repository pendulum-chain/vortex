import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readCdpWalletConfig } from "./config";

function env(values: Record<string, string>): ImportMetaEnv {
  return values as ImportMetaEnv;
}

describe("dashboard CDP configuration", () => {
  it("is disabled by default and never enables without a project ID", () => {
    assert.deepEqual(readCdpWalletConfig(env({})), {
      enabled: false,
      exportEnabled: false,
      offrampEnabled: false,
      onrampEnabled: false,
      projectId: "",
      provisioningEnabled: false,
      signingEnabled: false
    });
    assert.equal(readCdpWalletConfig(env({ VITE_CDP_ENABLED: "true" })).enabled, false);
  });

  it("requires an explicit true flag and reads the flow capability flags", () => {
    const config = readCdpWalletConfig(
      env({
        VITE_CDP_ENABLED: "TRUE",
        VITE_CDP_EXPORT_ENABLED: "true",
        VITE_CDP_OFFRAMP_ENABLED: "true",
        VITE_CDP_ONRAMP_ENABLED: "true",
        VITE_CDP_PROJECT_ID: " project-test ",
        VITE_CDP_PROVISIONING_ENABLED: "true",
        VITE_CDP_SIGNING_ENABLED: "true"
      })
    );
    assert.deepEqual(config, {
      enabled: true,
      exportEnabled: true,
      offrampEnabled: true,
      onrampEnabled: true,
      projectId: "project-test",
      provisioningEnabled: true,
      signingEnabled: true
    });
  });

  it("keeps signing and export disabled unless their dedicated kill switches are enabled", () => {
    const config = readCdpWalletConfig(
      env({
        VITE_CDP_ENABLED: "true",
        VITE_CDP_OFFRAMP_ENABLED: "true",
        VITE_CDP_PROJECT_ID: "project-test"
      })
    );

    assert.equal(config.enabled, true);
    assert.equal(config.offrampEnabled, true);
    assert.equal(config.signingEnabled, false);
    assert.equal(config.exportEnabled, false);
  });
});
