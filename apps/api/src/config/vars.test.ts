import {describe, expect, it} from "bun:test";

const varsModuleUrl = new URL("./vars.ts", import.meta.url).href;
const bunExecutable = Bun.argv[0];

const requiredProductionEnv = {
  ADMIN_SECRET: "test-admin-secret",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_KEY: "test-service-key",
  SUPABASE_URL: "https://example.supabase.co",
  WEBHOOK_PRIVATE_KEY: "test-webhook-private-key"
};

async function importVarsWithEnv(env: Record<string, string>) {
  const proc = Bun.spawn({
    cmd: [
      bunExecutable,
      "-e",
      `import(${JSON.stringify(varsModuleUrl)}).then(() => console.log("ok")).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); })`
    ],
    env: {
      PATH: process.env.PATH ?? "",
      ...requiredProductionEnv,
      ...env
    },
    stderr: "pipe",
    stdout: "pipe"
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ]);

  return { exitCode, stderr, stdout };
}

describe("vars deployment environment validation", () => {
  it("allows sandbox mode with a production runtime when the deployment is explicitly sandbox", async () => {
    const result = await importVarsWithEnv({
      DEPLOYMENT_ENV: "sandbox",
      NODE_ENV: "production",
      SANDBOX_ENABLED: "true"
    });

    expect(result).toEqual({ exitCode: 0, stderr: "", stdout: "ok\n" });
  });

  it("rejects sandbox mode when the deployment defaults to production", async () => {
    const result = await importVarsWithEnv({
      NODE_ENV: "production",
      SANDBOX_ENABLED: "true"
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("DEPLOYMENT_ENV=sandbox");
  });

  it("rejects a sandbox deployment without sandbox mode enabled", async () => {
    const result = await importVarsWithEnv({
      DEPLOYMENT_ENV: "sandbox",
      NODE_ENV: "production",
      SANDBOX_ENABLED: "false"
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("DEPLOYMENT_ENV=sandbox requires SANDBOX_ENABLED=true");
  });
});
