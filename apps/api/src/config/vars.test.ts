import {describe, expect, it} from "bun:test";
import os from "node:os";

const varsModuleUrl = new URL("./vars.ts", import.meta.url).href;
const bunExecutable = Bun.argv[0];

const requiredProductionEnv = {
  ADMIN_SECRET: "test-admin-secret",
  FLOW_VARIANT: "monerium",
  METRICS_DASHBOARD_SECRET: "test-metrics-dashboard-secret",
  MONERIUM_CLIENT_ID: "test-monerium-client-id",
  MONERIUM_ISSUE_FEE_EUR: "0",
  MONERIUM_REDIRECT_URI: "https://dashboard.example.com/monerium/callback",
  MONERIUM_WHITELABEL_CLIENT_ID: "test-monerium-whitelabel-client-id",
  MONERIUM_WHITELABEL_CLIENT_SECRET: "test-monerium-whitelabel-client-secret",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_KEY: "test-service-key",
  SUPABASE_URL: "https://example.supabase.co",
  WEBHOOK_PRIVATE_KEY: "test-webhook-private-key"
};

const requiredMoneriumB2bEnv = {
  FLOW_VARIANT: "mykobo",
  MONERIUM_B2B_ATTESTOR_PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  MONERIUM_B2B_ENABLED: "true",
  MONERIUM_B2B_FORWARDER_FACTORY_ADDRESS: "0x0000000000000000000000000000000000000001",
  MONERIUM_B2B_GUARDIAN_PRIVATE_KEY: "0x2222222222222222222222222222222222222222222222222222222222222222",
  MONERIUM_B2B_KEEPER_PRIVATE_KEY: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  MONERIUM_B2B_PRIVATE_RPC_URL: "https://private-rpc.example.com",
  MONERIUM_B2B_RPC_URL: "https://rpc.example.com",
  MONERIUM_B2B_WEBHOOK_SECRET: "whsec_MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=",
  MONERIUM_WHITELABEL_CLIENT_ID: "test-whitelabel-client-id",
  MONERIUM_WHITELABEL_CLIENT_SECRET: "test-whitelabel-client-secret"
};

async function importVarsWithEnv(env: Record<string, string>) {
  const proc = Bun.spawn({
    cmd: [
      bunExecutable,
      "-e",
      `import(${JSON.stringify(varsModuleUrl)}).then(() => console.log("ok")).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); })`
    ],
    // A cwd without .env files: bun auto-loads .env from the cwd, which would
    // silently backfill variables these scenarios deliberately leave unset.
    cwd: os.tmpdir(),
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

  it("requires the metrics dashboard secret in production", async () => {
    const result = await importVarsWithEnv({
      DEPLOYMENT_ENV: "production",
      METRICS_DASHBOARD_SECRET: "",
      NODE_ENV: "production"
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("METRICS_DASHBOARD_SECRET");
  });

  it("requires the exact Monerium callback URI in production", async () => {
    const result = await importVarsWithEnv({
      DEPLOYMENT_ENV: "production",
      MONERIUM_REDIRECT_URI: "",
      NODE_ENV: "production"
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("MONERIUM_REDIRECT_URI");
  });

  it("requires the Monerium auth-code client ID in production", async () => {
    const result = await importVarsWithEnv({
      DEPLOYMENT_ENV: "production",
      MONERIUM_CLIENT_ID: "",
      NODE_ENV: "production"
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("MONERIUM_CLIENT_ID");
  });

  it("boots in production without the Monerium white-label credentials", async () => {
    const result = await importVarsWithEnv({
      DEPLOYMENT_ENV: "production",
      MONERIUM_WHITELABEL_CLIENT_ID: "",
      MONERIUM_WHITELABEL_CLIENT_SECRET: "",
      NODE_ENV: "production"
    });

    expect(result.exitCode).toBe(0);
  });

  it("requires an explicit Monerium issue fee in production", async () => {
    const result = await importVarsWithEnv({
      DEPLOYMENT_ENV: "production",
      MONERIUM_ISSUE_FEE_EUR: "",
      NODE_ENV: "production"
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("MONERIUM_ISSUE_FEE_EUR");
  });

  it("rejects an invalid Monerium issue fee", async () => {
    const result = await importVarsWithEnv({
      DEPLOYMENT_ENV: "production",
      MONERIUM_ISSUE_FEE_EUR: "-1",
      NODE_ENV: "production"
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("MONERIUM_ISSUE_FEE_EUR must be a non-negative number");
  });

  it("keeps Monerium B2B disabled unless its flag is exactly true", async () => {
    for (const enabled of ["", "TRUE", "1", "false"]) {
      const result = await importVarsWithEnv({
        DEPLOYMENT_ENV: "production",
        MONERIUM_B2B_ENABLED: enabled,
        NODE_ENV: "production"
      });

      expect(result).toEqual({ exitCode: 0, stderr: "", stdout: "ok\n" });
    }
  });

  it("requires the complete Monerium B2B configuration when enabled", async () => {
    for (const name of Object.keys(requiredMoneriumB2bEnv).filter(
      name => name !== "MONERIUM_B2B_ENABLED" && name !== "FLOW_VARIANT"
    )) {
      const result = await importVarsWithEnv({
        ...requiredMoneriumB2bEnv,
        DEPLOYMENT_ENV: "production",
        [name]: "",
        NODE_ENV: "production"
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(name);
    }
  });

  it("accepts a complete Monerium B2B production configuration", async () => {
    const result = await importVarsWithEnv({
      ...requiredMoneriumB2bEnv,
      DEPLOYMENT_ENV: "production",
      NODE_ENV: "production"
    });

    expect(result).toEqual({ exitCode: 0, stderr: "", stdout: "ok\n" });
  });

  it("rejects malformed activation secrets and a zero factory", async () => {
    for (const overrides of [
      { MONERIUM_B2B_ATTESTOR_PRIVATE_KEY: "not-a-key" },
      { MONERIUM_B2B_ATTESTOR_PRIVATE_KEY: requiredMoneriumB2bEnv.MONERIUM_B2B_KEEPER_PRIVATE_KEY },
      { MONERIUM_B2B_FORWARDER_FACTORY_ADDRESS: "0x0000000000000000000000000000000000000000" },
      { MONERIUM_B2B_WEBHOOK_SECRET: "plain-text" }
    ]) {
      const result = await importVarsWithEnv({
        ...requiredMoneriumB2bEnv,
        ...overrides,
        DEPLOYMENT_ENV: "production",
        NODE_ENV: "production"
      });
      expect(result.exitCode).toBe(1);
    }
  });

  it("requires the mykobo flow variant when Monerium B2B is enabled", async () => {
    const result = await importVarsWithEnv({
      ...requiredMoneriumB2bEnv,
      DEPLOYMENT_ENV: "production",
      FLOW_VARIANT: "monerium",
      NODE_ENV: "production"
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("FLOW_VARIANT=mykobo");
  });

  it("accepts a lower recipient-invite discount ceiling", async () => {
    const result = await importVarsWithEnv({
      DEPLOYMENT_ENV: "production",
      NODE_ENV: "production",
      RECIPIENT_INVITE_MAX_DISCOUNT_BPS: "125"
    });

    expect(result).toEqual({ exitCode: 0, stderr: "", stdout: "ok\n" });
  });

  it("rejects a recipient-invite discount ceiling above the hard cap", async () => {
    const result = await importVarsWithEnv({
      DEPLOYMENT_ENV: "production",
      NODE_ENV: "production",
      RECIPIENT_INVITE_MAX_DISCOUNT_BPS: "301"
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("RECIPIENT_INVITE_MAX_DISCOUNT_BPS must be an integer between 0 and 300");
  });

  it("rejects a non-integer recipient-invite discount ceiling", async () => {
    const result = await importVarsWithEnv({
      DEPLOYMENT_ENV: "production",
      NODE_ENV: "production",
      RECIPIENT_INVITE_MAX_DISCOUNT_BPS: "2.5"
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("RECIPIENT_INVITE_MAX_DISCOUNT_BPS must be an integer between 0 and 300");
  });

  it("rejects an EVM destination network-fee margin below 100 percent", async () => {
    const result = await importVarsWithEnv({
      DEPLOYMENT_ENV: "production",
      EVM_DESTINATION_NETWORK_FEE_MARGIN_BPS: "9999",
      NODE_ENV: "production"
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("EVM_DESTINATION_NETWORK_FEE_MARGIN_BPS must be an integer between 10000 and 30000");
  });

  it("rejects a non-positive EVM destination execution-fee ceiling", async () => {
    const result = await importVarsWithEnv({
      DEPLOYMENT_ENV: "production",
      EVM_DESTINATION_MAX_EXECUTION_FEE_USD: "0",
      NODE_ENV: "production"
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("EVM_DESTINATION_MAX_EXECUTION_FEE_USD must be a positive number");
  });

  it("rejects non-decimal EVM destination execution-fee ceilings during startup", async () => {
    for (const invalidValue of ["0x10", "1e1"]) {
      const result = await importVarsWithEnv({
        DEPLOYMENT_ENV: "production",
        EVM_DESTINATION_MAX_EXECUTION_FEE_USD: invalidValue,
        NODE_ENV: "production"
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("EVM_DESTINATION_MAX_EXECUTION_FEE_USD must be a positive number");
    }
  });

  it("rejects non-decimal Mykobo fallback fees before returning strings to fee arithmetic", async () => {
    const result = await importVarsWithEnv({
      DEPLOYMENT_ENV: "production",
      MYKOBO_FALLBACK_DEPOSIT_FEE: "0x10",
      MYKOBO_FALLBACK_WITHDRAW_FEE: "1",
      MYKOBO_FEE_FALLBACK_ENABLED: "true",
      NODE_ENV: "production"
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("MYKOBO_FALLBACK_DEPOSIT_FEE must be a non-negative number");
  });
});
