import {describe, expect, it} from "bun:test";
import {enrichAdditionalDataWithClientIp, normalizeClientIp} from "./clientIp";

describe("normalizeClientIp", () => {
  it("normalizes IPv6 localhost to IPv4 localhost", () => {
    expect(normalizeClientIp("::1")).toBe("127.0.0.1");
  });

  it("normalizes IPv4-mapped IPv6 addresses to IPv4", () => {
    expect(normalizeClientIp("::ffff:203.0.113.42")).toBe("203.0.113.42");
  });

  it("keeps regular IPv4 addresses unchanged", () => {
    expect(normalizeClientIp("198.51.100.24")).toBe("198.51.100.24");
  });
});

describe("enrichAdditionalDataWithClientIp", () => {
  it("adds the normalized request IP when additional data does not include one", () => {
    const additionalData = enrichAdditionalDataWithClientIp({ email: "user@example.com" }, { ip: "::1" });

    expect(additionalData).toEqual({
      email: "user@example.com",
      ipAddress: "127.0.0.1"
    });
  });

  it("keeps a provided IPv4 address over the request IP", () => {
    const additionalData = enrichAdditionalDataWithClientIp({ ipAddress: "198.51.100.24" }, { ip: "::1" });

    expect(additionalData.ipAddress).toBe("198.51.100.24");
  });

  it("normalizes a provided IPv4-mapped address", () => {
    const additionalData = enrichAdditionalDataWithClientIp({ ipAddress: "::ffff:198.51.100.24" }, { ip: "::1" });

    expect(additionalData.ipAddress).toBe("198.51.100.24");
  });
});
