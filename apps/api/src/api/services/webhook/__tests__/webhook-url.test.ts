import { describe, expect, it } from "bun:test";
import { getWebhookUrlViolation, isPublicIpAddress } from "../webhook-url";

describe("isPublicIpAddress", () => {
  it.each([
    "8.8.8.8",
    "93.184.216.34",
    "203.0.113.10",
    "2600:1f18::1"
  ])("accepts public address %s", address => {
    expect(isPublicIpAddress(address)).toBe(true);
  });

  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.168.0.1",
    "198.18.0.1",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:10.0.0.1",
    "::ffff:127.0.0.1"
  ])("rejects private/reserved address %s", address => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it("rejects non-IP strings", () => {
    expect(isPublicIpAddress("localhost")).toBe(false);
    expect(isPublicIpAddress("not-an-ip")).toBe(false);
  });
});

describe("getWebhookUrlViolation", () => {
  it("accepts a plain HTTPS URL", () => {
    expect(getWebhookUrlViolation("https://partner.example.com/hooks/vortex")).toBeNull();
  });

  it("accepts an HTTPS URL with a custom port", () => {
    expect(getWebhookUrlViolation("https://partner.example.com:8443/hooks")).toBeNull();
  });

  it("rejects non-HTTPS schemes", () => {
    expect(getWebhookUrlViolation("http://partner.example.com/hooks")).toContain("HTTPS");
    expect(getWebhookUrlViolation("ftp://partner.example.com/hooks")).toContain("HTTPS");
  });

  it("rejects unparseable URLs", () => {
    expect(getWebhookUrlViolation("not a url")).toContain("Invalid URL");
  });

  it("rejects embedded credentials", () => {
    expect(getWebhookUrlViolation("https://user:pw@example.com/hooks")).toContain("credentials");
  });

  it("rejects private and reserved IP literals, including bracketed IPv6", () => {
    expect(getWebhookUrlViolation("https://127.0.0.1/hooks")).toContain("private or reserved");
    expect(getWebhookUrlViolation("https://192.168.0.10/hooks")).toContain("private or reserved");
    expect(getWebhookUrlViolation("https://[::1]/hooks")).toContain("private or reserved");
    expect(getWebhookUrlViolation("https://[fd00::1]/hooks")).toContain("private or reserved");
  });

  it("accepts public IP literals", () => {
    expect(getWebhookUrlViolation("https://8.8.8.8/hooks")).toBeNull();
  });
});
