import {describe, expect, it} from "bun:test";
import {config} from "../../config/vars";
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
    const additionalData = await enrichAdditionalDataWithClientIp({ email: "user@example.com" }, { ip: "::ffff:203.0.113.42" });

    expect(additionalData?.email).toBe("user@example.com");
    expect(additionalData?.ipAddress).toBe("203.0.113.42");
  });

  it("keeps a loopback request IP without a public-IP lookup outside development", async () => {
    const originalDeploymentEnv = config.deploymentEnv;
    const originalFetch = globalThis.fetch;
    let lookupAttempted = false;
    config.deploymentEnv = "staging";
    globalThis.fetch = (async () => {
      lookupAttempted = true;
      throw new Error("unexpected network call");
    }) as unknown as typeof fetch;

    try {
      const additionalData = await enrichAdditionalDataWithClientIp({ email: "user@example.com" }, { ip: "::1" });

      expect(lookupAttempted).toBe(false);
      expect(additionalData?.ipAddress).toBe("127.0.0.1");
    } finally {
      config.deploymentEnv = originalDeploymentEnv;
      globalThis.fetch = originalFetch;
    }
  });

  it("substitutes the host public IP for a loopback request IP in development", async () => {
    const originalDeploymentEnv = config.deploymentEnv;
    const originalFetch = globalThis.fetch;
    config.deploymentEnv = "development";
    globalThis.fetch = (async () => new Response(JSON.stringify({ ip: "203.0.113.99" }))) as unknown as typeof fetch;

    try {
      const additionalData = await enrichAdditionalDataWithClientIp({ email: "user@example.com" }, { ip: "::1" });

      expect(additionalData?.ipAddress).toBe("203.0.113.99");
    } finally {
      config.deploymentEnv = originalDeploymentEnv;
      globalThis.fetch = originalFetch;
    }
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
