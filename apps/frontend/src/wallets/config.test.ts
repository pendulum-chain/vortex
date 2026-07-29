import { describe, expect, it } from "vitest";
import { isCdpOriginAllowed, readCdpWidgetConfig } from "./config";

function env(values: Record<string, string>): ImportMetaEnv {
  return values as ImportMetaEnv;
}

describe("widget CDP configuration", () => {
  it("stays disabled without both the explicit flag and project ID", () => {
    expect(readCdpWidgetConfig(env({})).enabled).toBe(false);
    expect(readCdpWidgetConfig(env({ VITE_CDP_ENABLED: "true" })).enabled).toBe(false);
  });

  it("normalizes and deduplicates exact allowed parent origins", () => {
    expect(
      readCdpWidgetConfig(
        env({
          VITE_CDP_ENABLED: "true",
          VITE_CDP_PROJECT_ID: "project-test",
          VITE_CDP_PROVISIONING_ENABLED: "true",
          VITE_CDP_WIDGET_PARENT_ORIGINS:
            "https://partner.example/path, https://partner.example,not-a-url,https://vortex.example"
        })
      )
    ).toMatchObject({
      allowedParentOrigins: ["https://partner.example", "https://vortex.example"],
      enabled: true,
      projectId: "project-test",
      provisioningEnabled: true
    });
  });

  it("allows top-level pages and known iframe parents but rejects unknown or referrer-less parents", () => {
    const config = { allowedParentOrigins: ["https://partner.example"] };
    expect(isCdpOriginAllowed(config, { isTopLevel: true, referrer: "" })).toBe(true);
    expect(
      isCdpOriginAllowed(config, {
        isTopLevel: false,
        referrer: "https://partner.example/checkout"
      })
    ).toBe(true);
    expect(
      isCdpOriginAllowed(config, {
        isTopLevel: false,
        referrer: "https://unknown.example/checkout"
      })
    ).toBe(false);
    expect(isCdpOriginAllowed(config, { isTopLevel: false, referrer: "" })).toBe(false);
  });
});
