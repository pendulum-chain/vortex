import { describe, expect, it } from "bun:test";
import os from "node:os";
import { shouldStartMoneriumB2bWorker } from "./feature";

const expressModuleUrl = new URL("../../../config/express.ts", import.meta.url).href;
const routesModuleUrl = new URL("../../routes/v1/index.ts", import.meta.url).href;

describe("Monerium B2B feature gate", () => {
  it("starts the keeper only for an enabled mykobo process", () => {
    expect(shouldStartMoneriumB2bWorker("mykobo", true)).toBe(true);
    expect(shouldStartMoneriumB2bWorker("mykobo", false)).toBe(false);
    expect(shouldStartMoneriumB2bWorker("monerium", true)).toBe(false);
  });

  it("does not mount the parser, public routes, or admin routes when disabled", async () => {
    const script = `
      const { default: app } = await import(${JSON.stringify(expressModuleUrl)});
      const { default: routes } = await import(${JSON.stringify(routesModuleUrl)});
      const matches = path => routes.stack.some(layer => layer.matchers.some(matcher => matcher(path)));
      console.log(JSON.stringify({
        adminMounted: matches("/admin/monerium-b2b/accounts"),
        moneriumJsonParsers: app.router.stack.filter(layer => layer.name === "jsonParser").length - 1,
        publicMounted: matches("/monerium-b2b/account")
      }));
    `;
    const proc = Bun.spawn({
      cmd: [Bun.argv[0], "-e", script],
      cwd: os.tmpdir(),
      env: {
        ADMIN_SECRET: "test-admin-secret",
        FLOW_VARIANT: "mykobo",
        MONERIUM_B2B_ENABLED: "false",
        NODE_ENV: "test",
        PATH: process.env.PATH ?? "",
        SUPABASE_ANON_KEY: "test-anon-key",
        SUPABASE_SERVICE_KEY: "test-service-key",
        SUPABASE_URL: "https://example.supabase.co",
        WEBHOOK_PRIVATE_KEY: "test-webhook-private-key"
      },
      stderr: "pipe",
      stdout: "pipe"
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text()
    ]);

    const lastLine = stdout.trim().split("\n").at(-1);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(lastLine ? JSON.parse(lastLine) : null).toEqual({
      adminMounted: false,
      moneriumJsonParsers: 0,
      publicMounted: false
    });
  });
});
