import { describe, expect, it } from "vitest";
import { isPrivyOriginAllowed, readPrivyWidgetConfig } from "./config";

function env(values: Record<string, string>): ImportMetaEnv {
  return values as ImportMetaEnv;
}

describe("widget Privy configuration", () => {
  it("stays disabled without both the explicit flag and app ID", () => {
    expect(readPrivyWidgetConfig(env({})).enabled).toBe(false);
    expect(readPrivyWidgetConfig(env({ VITE_PRIVY_ENABLED: "true" })).enabled).toBe(false);
  });

  it("normalizes and deduplicates exact allowed parent origins", () => {
    expect(
      readPrivyWidgetConfig(
        env({
          VITE_PRIVY_APP_ID: "app-test",
          VITE_PRIVY_ENABLED: "true",
          VITE_PRIVY_PROVISIONING_ENABLED: "true",
          VITE_PRIVY_WIDGET_PARENT_ORIGINS:
            "https://partner.example/path, https://partner.example,not-a-url,https://vortex.example"
        })
      )
    ).toMatchObject({
      allowedParentOrigins: ["https://partner.example", "https://vortex.example"],
      enabled: true,
      gasPolicy: "user_pays",
      provisioningEnabled: true
    });
  });

  it("allows top-level pages and known iframe parents but rejects unknown or referrer-less parents", () => {
    const config = { allowedParentOrigins: ["https://partner.example"] };
    expect(isPrivyOriginAllowed(config, { isTopLevel: true, referrer: "" })).toBe(true);
    expect(
      isPrivyOriginAllowed(config, {
        isTopLevel: false,
        referrer: "https://partner.example/checkout"
      })
    ).toBe(true);
    expect(
      isPrivyOriginAllowed(config, {
        isTopLevel: false,
        referrer: "https://unknown.example/checkout"
      })
    ).toBe(false);
    expect(isPrivyOriginAllowed(config, { isTopLevel: false, referrer: "" })).toBe(false);
  });
});
