import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import express from "express";
import logger from "../../config/logger";
import { config } from "../../config/vars";
import { adminAuth } from "./adminAuth";
import { metricsDashboardAuth } from "./metricsDashboardAuth";

/**
 * Characterization of the two bearer-secret middlewares: every status, error body (including
 * key order), header and log line is pinned so they can share one implementation.
 */
const cases = [
  {
    codes: {
      error: "ADMIN_AUTH_ERROR",
      invalidToken: "INVALID_ADMIN_TOKEN",
      notConfigured: "ADMIN_AUTH_NOT_CONFIGURED",
      required: "ADMIN_AUTH_REQUIRED"
    },
    configKey: "adminSecret",
    envName: "ADMIN_SECRET",
    logs: {
      error: "Error in admin authentication:",
      failed: "Failed admin auth attempt",
      missingHeader: "Admin auth attempt without Authorization header"
    },
    messages: {
      error: "An error occurred during admin authentication",
      invalidToken: "Invalid admin token",
      notConfigured: "Admin authentication is not properly configured",
      required: "Admin authentication required. Provide Authorization header with Bearer token."
    },
    middleware: adminAuth,
    name: "adminAuth"
  },
  {
    codes: {
      error: "METRICS_DASHBOARD_AUTH_ERROR",
      invalidToken: "INVALID_METRICS_DASHBOARD_TOKEN",
      notConfigured: "METRICS_DASHBOARD_AUTH_NOT_CONFIGURED",
      required: "METRICS_DASHBOARD_AUTH_REQUIRED"
    },
    configKey: "metricsDashboardSecret",
    envName: "METRICS_DASHBOARD_SECRET",
    logs: {
      error: "Error in metrics dashboard authentication:",
      failed: "Failed metrics dashboard auth attempt",
      missingHeader: "Metrics dashboard auth attempt without Authorization header"
    },
    messages: {
      error: "An error occurred during metrics dashboard authentication",
      invalidToken: "Invalid metrics dashboard token",
      notConfigured: "Metrics dashboard authentication is not properly configured",
      required: "Metrics dashboard authentication required. Provide Authorization header with Bearer token."
    },
    middleware: metricsDashboardAuth,
    name: "metricsDashboardAuth"
  }
] as const;

const INVALID_FORMAT_BODY =
  '{"error":{"code":"INVALID_AUTH_FORMAT","message":"Invalid authorization format. Use: Authorization: Bearer <token>","status":401}}';

const errorBody = (code: string, message: string, status: number) => JSON.stringify({ error: { code, message, status } });

for (const testCase of cases) {
  describe(testCase.name, () => {
    const originalSecret = config[testCase.configKey];
    let warn: ReturnType<typeof spyOn>;
    let error: ReturnType<typeof spyOn>;
    // The logger is process-global: fire-and-forget work from earlier test files can log while a
    // request is in flight, so assertions only count the lines this middleware can emit.
    const ownMessages = new Set<unknown>([
      ...Object.values(testCase.logs),
      `${testCase.envName} not configured in environment variables`
    ]);
    const own = (spy: ReturnType<typeof spyOn>) => spy.mock.calls.filter((call: unknown[]) => ownMessages.has(call[0]));

    beforeEach(() => {
      config[testCase.configKey] = "s3cret-value";
      warn = spyOn(logger, "warn").mockImplementation((() => logger) as never);
      error = spyOn(logger, "error").mockImplementation((() => logger) as never);
    });

    afterEach(() => {
      Object.defineProperty(config, testCase.configKey, {
        configurable: true,
        enumerable: true,
        value: originalSecret,
        writable: true
      });
      warn.mockRestore();
      error.mockRestore();
    });

    async function call(authorization?: string) {
      const app = express();
      app.get("/guarded", testCase.middleware, (_req, res) => {
        res.json({ reached: true });
      });

      const server = app.listen(0);
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        throw new Error("Could not bind test server");
      }

      try {
        const response = await fetch(`http://127.0.0.1:${address.port}/guarded`, {
          ...(authorization === undefined ? {} : { headers: { Authorization: authorization } })
        });
        return { headers: response.headers, status: response.status, text: await response.text() };
      } finally {
        server.close();
      }
    }

    it("rejects a missing Authorization header with 401 and warns", async () => {
      const result = await call();

      expect(result.status).toBe(401);
      expect(result.text).toBe(errorBody(testCase.codes.required, testCase.messages.required, 401));
      expect(result.headers.get("content-type")).toBe("application/json; charset=utf-8");
      expect(result.headers.get("www-authenticate")).toBeNull();
      expect(own(warn)).toEqual([[testCase.logs.missingHeader, { ip: expect.any(String), path: "/guarded" }]]);
      expect(own(error)).toEqual([]);
    });

    it("answers a missing header with 401 even when the secret is not configured", async () => {
      config[testCase.configKey] = "";
      const result = await call();

      expect(result.status).toBe(401);
      expect(JSON.parse(result.text).error.code).toBe(testCase.codes.required);
    });

    for (const header of ["Basic s3cret-value", "Bearer", "Bearer s3cret-value extra", "bearer s3cret-value", "s3cret-value"]) {
      it(`rejects the malformed header ${JSON.stringify(header)} with 401 INVALID_AUTH_FORMAT and no log`, async () => {
        const result = await call(header);

        expect(result.status).toBe(401);
        expect(result.text).toBe(INVALID_FORMAT_BODY);
        expect(result.headers.get("www-authenticate")).toBeNull();
        expect(own(warn)).toEqual([]);
        expect(own(error)).toEqual([]);
      });
    }

    it("returns 500 and logs when the secret is not configured", async () => {
      config[testCase.configKey] = "";
      const result = await call("Bearer anything");

      expect(result.status).toBe(500);
      expect(result.text).toBe(errorBody(testCase.codes.notConfigured, testCase.messages.notConfigured, 500));
      expect(own(error)).toEqual([[`${testCase.envName} not configured in environment variables`]]);
      expect(own(warn)).toEqual([]);
    });

    // Same-length, shorter and longer tokens
    for (const token of ["s3cret-valuX", "s3cret", "s3cret-value-and-more"]) {
      it(`rejects the wrong token ${JSON.stringify(token)} with 403 and warns`, async () => {
        const result = await call(`Bearer ${token}`);

        expect(result.status).toBe(403);
        expect(result.text).toBe(errorBody(testCase.codes.invalidToken, testCase.messages.invalidToken, 403));
        expect(result.headers.get("www-authenticate")).toBeNull();
        expect(own(warn)).toEqual([[testCase.logs.failed, { ip: expect.any(String), path: "/guarded" }]]);
        expect(own(error)).toEqual([]);
      });
    }

    it("passes the request through to the next handler on the right token without logging", async () => {
      const result = await call("Bearer s3cret-value");

      expect(result.status).toBe(200);
      expect(result.text).toBe('{"reached":true}');
      expect(own(warn)).toEqual([]);
      expect(own(error)).toEqual([]);
    });

    // Called directly: HTTP clients mangle non-ASCII header values before they reach the middleware.
    it("compares tokens as UTF-8 bytes (multi-byte secret, same-length and different-length mismatches)", () => {
      config[testCase.configKey] = "p\u00e4ss-\u00fcber";
      const outcome = (token: string) => {
        let status: number | undefined;
        let nextCalled = false;
        const res = {
          json: () => res,
          status: (code: number) => {
            status = code;
            return res;
          }
        };
        testCase.middleware(
          { headers: { authorization: `Bearer ${token}` }, ip: "127.0.0.1", path: "/guarded" } as never,
          res as never,
          (() => {
            nextCalled = true;
          }) as never
        );
        return { nextCalled, status };
      };

      expect(outcome("p\u00e4ss-\u00fcber")).toEqual({ nextCalled: true, status: undefined });
      expect(outcome("p\u00e4ss-\u00fcbes")).toEqual({ nextCalled: false, status: 403 }); // same byte length, last byte differs
      // The secret is 11 bytes in UTF-8 but 9 characters: an 11-character ASCII token has the same byte length
      expect(outcome("pass-uber!!")).toEqual({ nextCalled: false, status: 403 });
      expect(outcome("pass-uber")).toEqual({ nextCalled: false, status: 403 }); // 9 bytes, shorter than the secret
    });

    it("returns 500 and logs the thrown error when reading the secret throws", async () => {
      const boom = new Error("config exploded");
      Object.defineProperty(config, testCase.configKey, {
        configurable: true,
        enumerable: true,
        get() {
          throw boom;
        }
      });

      const result = await call("Bearer s3cret-value");

      expect(result.status).toBe(500);
      expect(result.text).toBe(errorBody(testCase.codes.error, testCase.messages.error, 500));
      expect(own(error)).toEqual([[testCase.logs.error, boom]]);
    });
  });
}

describe("bearer secret middlewares are independent", () => {
  const originalAdmin = config.adminSecret;
  const originalMetrics = config.metricsDashboardSecret;

  afterEach(() => {
    config.adminSecret = originalAdmin;
    config.metricsDashboardSecret = originalMetrics;
  });

  it("each middleware reads its own secret at request time", async () => {
    config.adminSecret = "admin-one";
    config.metricsDashboardSecret = "metrics-one";
    const app = express();
    app.get("/admin", adminAuth, (_req, res) => void res.json({ ok: "admin" }));
    app.get("/metrics", metricsDashboardAuth, (_req, res) => void res.json({ ok: "metrics" }));
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Could not bind test server");
    }
    const base = `http://127.0.0.1:${address.port}`;

    try {
      const status = async (path: string, token: string) =>
        (await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } })).status;

      expect(await status("/admin", "admin-one")).toBe(200);
      expect(await status("/admin", "metrics-one")).toBe(403);
      expect(await status("/metrics", "metrics-one")).toBe(200);
      expect(await status("/metrics", "admin-one")).toBe(403);

      config.adminSecret = "admin-two";
      expect(await status("/admin", "admin-one")).toBe(403);
      expect(await status("/admin", "admin-two")).toBe(200);
    } finally {
      server.close();
    }
  });
});
