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
  it("adds the normalized request IP when additional data does not include one", async () => {
    // A non-loopback request IP: loopback would trigger the real public-IP lookup
    // (fetchHostPublicIp) in non-production, making the result network-dependent.
    const additionalData = await enrichAdditionalDataWithClientIp({ email: "user@example.com" }, { ip: "::ffff:203.0.113.42" });

    expect(additionalData?.email).toBe("user@example.com");
    expect(additionalData?.ipAddress).toBe("203.0.113.42");
  });

  it("keeps a provided IPv4 address over the request IP", async () => {
    const additionalData = await enrichAdditionalDataWithClientIp({ ipAddress: "198.51.100.24" }, { ip: "::1" });

    expect(additionalData?.ipAddress).toBe("198.51.100.24");
  });

  it("normalizes a provided IPv4-mapped address", async () => {
    const additionalData = await enrichAdditionalDataWithClientIp({ ipAddress: "::ffff:198.51.100.24" }, { ip: "::1" });

    expect(additionalData?.ipAddress).toBe("198.51.100.24");
  });
});
