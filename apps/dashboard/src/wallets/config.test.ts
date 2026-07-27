import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readPrivyWalletConfig } from "./config";

function env(values: Record<string, string>): ImportMetaEnv {
  return values as ImportMetaEnv;
}

describe("dashboard Privy configuration", () => {
  it("is disabled by default and never enables without an app ID", () => {
    assert.deepEqual(readPrivyWalletConfig(env({})), {
      appId: "",
      clientId: undefined,
      enabled: false,
      gasPolicy: "user_pays",
      offrampEnabled: false,
      onrampEnabled: false,
      provisioningEnabled: false
    });
    assert.equal(readPrivyWalletConfig(env({ VITE_PRIVY_ENABLED: "true" })).enabled, false);
  });

  it("requires an explicit true flag and defaults unknown gas policies to user-pays", () => {
    const config = readPrivyWalletConfig(
      env({
        VITE_PRIVY_APP_ID: " app-test ",
        VITE_PRIVY_CLIENT_ID: " client-test ",
        VITE_PRIVY_ENABLED: "TRUE",
        VITE_PRIVY_GAS_POLICY: "anything",
        VITE_PRIVY_OFFRAMP_ENABLED: "true",
        VITE_PRIVY_ONRAMP_ENABLED: "true",
        VITE_PRIVY_PROVISIONING_ENABLED: "true"
      })
    );
    assert.deepEqual(config, {
      appId: "app-test",
      clientId: "client-test",
      enabled: true,
      gasPolicy: "user_pays",
      offrampEnabled: true,
      onrampEnabled: true,
      provisioningEnabled: true
    });
  });
});
