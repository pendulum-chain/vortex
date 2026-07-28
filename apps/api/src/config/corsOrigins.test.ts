import { describe, expect, it } from "bun:test";

import { buildDashboardPreviewOriginRegex, parseDashboardOrigins } from "./corsOrigins";

describe("parseDashboardOrigins", () => {
  it("splits, trims and drops empty entries", () => {
    expect(parseDashboardOrigins(" https://a.example.com , https://b.example.com ,, ")).toEqual([
      "https://a.example.com",
      "https://b.example.com"
    ]);
  });

  it("returns an empty list for undefined", () => {
    expect(parseDashboardOrigins(undefined)).toEqual([]);
  });

  it("drops entries containing wildcards", () => {
    expect(parseDashboardOrigins("https://*.netlify.app,https://ok.example.com")).toEqual(["https://ok.example.com"]);
  });
});

describe("buildDashboardPreviewOriginRegex", () => {
  it("matches only exact deploy-preview origins of the configured site", () => {
    const regex = buildDashboardPreviewOriginRegex("vortex-dashboard", "staging");
    expect(regex).not.toBeNull();
    expect(regex?.test("https://deploy-preview-42--vortex-dashboard.netlify.app")).toBe(true);
    expect(regex?.test("https://deploy-preview-1--vortex-dashboard.netlify.app")).toBe(true);

    expect(regex?.test("http://deploy-preview-42--vortex-dashboard.netlify.app")).toBe(false);
    expect(regex?.test("https://deploy-preview-42--vortex-dashboard.netlify.app.evil.com")).toBe(false);
    expect(regex?.test("https://evil.com/deploy-preview-42--vortex-dashboard.netlify.app")).toBe(false);
    expect(regex?.test("https://deploy-preview-42--other-site.netlify.app")).toBe(false);
    expect(regex?.test("https://deploy-preview---vortex-dashboard.netlify.app")).toBe(false);
    expect(regex?.test("https://staging--vortex-dashboard.netlify.app")).toBe(false);
  });

  it("returns null in production", () => {
    expect(buildDashboardPreviewOriginRegex("vortex-dashboard", "production")).toBeNull();
  });

  it("returns null when the slug is missing or empty", () => {
    expect(buildDashboardPreviewOriginRegex(undefined, "staging")).toBeNull();
    expect(buildDashboardPreviewOriginRegex("", "staging")).toBeNull();
  });

  it("rejects slugs that could widen the pattern", () => {
    expect(buildDashboardPreviewOriginRegex(".+", "staging")).toBeNull();
    expect(buildDashboardPreviewOriginRegex("site.netlify.app", "staging")).toBeNull();
    expect(buildDashboardPreviewOriginRegex("Site", "staging")).toBeNull();
    expect(buildDashboardPreviewOriginRegex("a b", "staging")).toBeNull();
    expect(buildDashboardPreviewOriginRegex("-leading", "staging")).toBeNull();
  });
});
