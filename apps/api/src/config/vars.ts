interface PriceProvider {
  baseUrl: string;
  appId?: string;
  secretKey?: string;
  partnerApiKey?: string;
  apiKey?: string;
}

/**
 * The GoogleCredentials interface is the same as in the api/.../spreadsheet.service.ts
 */
interface GoogleCredentials {
  email?: string;
  key?: string;
}

interface SpreadsheetConfig {
  googleCredentials: GoogleCredentials;
  storageSheetId: string | undefined;
  emailSheetId: string | undefined;
  contactSheetId: string | undefined;
  ratingSheetId: string | undefined;
}

type DeploymentEnv = "development" | "production" | "sandbox" | "staging" | "test";
const DECIMAL_STRING_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;

// Identifies which onramp flow this backend instance serves. Two backends
// share one database; each ignores ramps/quotes belonging to the other flow.
// "monerium" is the legacy grace-period backend; "mykobo" is the new replacement.
export type FlowVariant = "monerium" | "mykobo";

const nodeEnv = process.env.NODE_ENV || "production";
const deploymentEnvValues: DeploymentEnv[] = ["development", "production", "sandbox", "staging", "test"];
const flowVariantValues: FlowVariant[] = ["monerium", "mykobo"];

function readDeploymentEnv(): DeploymentEnv {
  const rawDeploymentEnv = process.env.DEPLOYMENT_ENV || (nodeEnv === "production" ? "production" : nodeEnv);

  if (!deploymentEnvValues.includes(rawDeploymentEnv as DeploymentEnv)) {
    throw new Error(`DEPLOYMENT_ENV must be one of: ${deploymentEnvValues.join(", ")}`);
  }

  return rawDeploymentEnv as DeploymentEnv;
}

function readFlowVariant(): FlowVariant {
  const rawFlowVariant = process.env.FLOW_VARIANT || "monerium";

  if (!flowVariantValues.includes(rawFlowVariant as FlowVariant)) {
    throw new Error(`FLOW_VARIANT must be one of: ${flowVariantValues.join(", ")} (got '${rawFlowVariant}')`);
  }

  return rawFlowVariant as FlowVariant;
}

interface MykoboFeeFallback {
  enabled: boolean;
  depositFee: string | undefined;
  withdrawFee: string | undefined;
}

// Retained for legacy Mykobo flow simulation tests. New quotes no longer select Mykobo.
function readMykoboFeeFallback(): MykoboFeeFallback {
  const enabled = process.env.MYKOBO_FEE_FALLBACK_ENABLED === "true";
  if (!enabled) {
    return { depositFee: undefined, enabled: false, withdrawFee: undefined };
  }
  return {
    depositFee: readNonNegativeDecimalEnv("MYKOBO_FALLBACK_DEPOSIT_FEE"),
    enabled: true,
    withdrawFee: readNonNegativeDecimalEnv("MYKOBO_FALLBACK_WITHDRAW_FEE")
  };
}

function readNonNegativeDecimalEnv(name: string): string {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) {
    throw new Error(`${name} is required`);
  }
  const value = Number(rawValue);
  if (!DECIMAL_STRING_PATTERN.test(rawValue) || !Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number (got '${rawValue}')`);
  }
  return rawValue;
}

function readFractionEnv(name: string, defaultValue: string): number {
  const rawValue = process.env[name] ?? defaultValue;
  const trimmedValue = rawValue.trim();

  if (trimmedValue === "") {
    throw new Error(`${name} must be a finite number between 0 and 1`);
  }

  const value = Number(trimmedValue);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a finite number between 0 and 1`);
  }

  return value;
}

function readPositiveDecimalEnv(name: string, defaultValue: string): string {
  const rawValue = process.env[name] ?? defaultValue;
  const trimmedValue = rawValue.trim();
  const value = Number(trimmedValue);
  if (!DECIMAL_STRING_PATTERN.test(trimmedValue) || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return trimmedValue;
}

function readEvmDestinationNetworkFeeMarginBps(): number {
  const name = "EVM_DESTINATION_NETWORK_FEE_MARGIN_BPS";
  const rawValue = process.env[name] ?? "12000";
  const value = Number(rawValue.trim());
  if (!Number.isInteger(value) || value < 10_000 || value > 30_000 || rawValue.trim() === "") {
    throw new Error(`${name} must be an integer between 10000 and 30000`);
  }
  return value;
}

function readEmailAllowlist(): string[] {
  return (process.env.EMAIL_RECIPIENT_ALLOWLIST || "")
    .split(",")
    .map(entry => entry.trim().toLowerCase())
    .filter(entry => entry.length > 0);
}

export const RECIPIENT_INVITE_DISCOUNT_HARD_CAP_BPS = 300;

function readRecipientInviteDiscountLimit(): number {
  const name = "RECIPIENT_INVITE_MAX_DISCOUNT_BPS";
  const rawValue = process.env[name] ?? String(RECIPIENT_INVITE_DISCOUNT_HARD_CAP_BPS);
  const value = Number(rawValue.trim());
  if (!Number.isInteger(value) || value < 0 || value > RECIPIENT_INVITE_DISCOUNT_HARD_CAP_BPS || rawValue.trim() === "") {
    throw new Error(`${name} must be an integer between 0 and ${RECIPIENT_INVITE_DISCOUNT_HARD_CAP_BPS}`);
  }
  return value;
}

interface Config {
  env: string;
  deploymentEnv: DeploymentEnv;
  /** Login email of the seeded sales-demo account. Sandbox only; see docs/operations-demo-environment.md. */
  demoAccountEmail: string;
  /**
   * Replaces the Alfredpay client with a canned in-process stand-in so the demo corridor can be
   * onboarded repeatedly without touching Alfredpay's sandbox. Sandbox only, and off by default —
   * a sandbox used for partner integration testing must keep the real provider.
   */
  demoProviderEnabled: boolean;
  flowVariant: FlowVariant;
  port: string | number;
  amplitudeWss: string;
  pendulumWss: string;
  rateLimitMaxRequests: string | number;
  rateLimitWindowMinutes: string | number;
  rateLimitNumberOfProxies: string | number;
  logs: string;
  adminSecret: string;
  metricsDashboardSecret: string;
  /** Kill switch for vortex_admin "act as another profile" sessions. */
  impersonationEnabled: boolean;
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
  };
  priceProviders: {
    alchemyPay: PriceProvider;
    binance: PriceProvider;
    transak: PriceProvider;
    moonpay: PriceProvider;
    coingecko: {
      apiKey: string | undefined;
      baseUrl: string;
      cryptoCacheTtlMs: number;
      fiatCacheTtlMs: number;
    };
    fastforex: {
      apiKey: string | undefined;
      baseUrl: string;
    };
  };
  spreadsheet: SpreadsheetConfig;
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    dialect: "postgres";
    logging: boolean;
  };
  swap: {
    deadlineMinutes: number;
  };
  subsidy: {
    evmPostSwapDiscountSubsidyQuoteFraction: number;
    evmSwapSubsidyQuoteFraction: number;
  };
  quote: {
    discountStateTimeoutMinutes: number;
    deltaDBasisPoints: number;
  };
  recipients: {
    inviteMaxDiscountBps: number;
  };
  mykobo: {
    feeFallback: MykoboFeeFallback;
  };
  monerium: {
    apiUrl: string;
    clientId: string;
    eurOnrampEnabled: boolean;
    issueFeeEur: string | undefined;
    redirectUri: string;
    whiteLabelClientId: string;
    widgetRedirectUri: string | undefined;
    whiteLabelClientSecret: string;
  };
  // B2B whitelabel onramp integration (docs/architecture-monerium-b2b-onramp.md §3).
  // Separate credential set from the legacy consumer OAuth integration above.
  moneriumB2b: {
    attestorPrivateKey: string | undefined;
    /** off: nothing; alert: log deposits past the window; auto: mark them and run the refund. */
    autoRecovery: "off" | "alert" | "auto";
    enabled: boolean;
    /** Key of the EURe float wallet that tops a refund up to the exact amount. */
    floatPrivateKey: string | undefined;
    /** Seconds between keeper cycles: how often a waiting chunk is re-quoted. */
    keeperCycleSeconds: number;
    forwarderFactoryAddress: string | undefined;
    guardianPrivateKey: string | undefined;
    keeperPrivateKey: string | undefined;
    privateRpcUrl: string | undefined;
    /** Promised conversion window from the mint, in minutes; the on-chain RECOVERY_DELAY is its floor. */
    recoveryDeadlineMinutes: number;
    /** Key of the immutable RECOVERY_WALLET: signs the reverse swap and the Monerium redeem message. */
    recoveryPrivateKey: string | undefined;
    rpcUrl: string | undefined;
    /**
     * How much of a chunk's shortfall below the client's floor Vortex pays, as a ladder of
     * "after N seconds waited, at most M bps of the reference value" steps; before the first
     * step's time the keeper only executes fills at or above the floor.
     */
    subsidyLadder: Array<{ afterSeconds: number; maxSubsidyBps: number }>;
    webhookSecret: string;
  };
  subscanApiKey: string | undefined;
  vortexFeePenPercentage: number;

  secrets: {
    pendulumFundingSeed: string | undefined;
    moonbeamExecutorPrivateKey: string | undefined;
    webhookPrivateKey: string | undefined;
  };

  integrations: {
    alchemy: {
      apiKey: string | undefined;
    };
    avenia: {
      // Public URL of this backend's /v1/webhooks/avenia receiver, used only by the
      // subscription registration script.
      webhookUrl: string | undefined;
    };
    resend: {
      apiKey: string | undefined;
      fromAddress: string;
      replyToAddress: string | undefined;
      // Outside production, only these recipients receive mail; everything else is
      // recorded as skipped. Empty means no recipient at all outside production.
      recipientAllowlist: string[];
    };
    slack: {
      webhookToken: string | undefined;
      userId: string | undefined;
    };
  };

  sandboxEnabled: boolean;
  rampWidgetUrl: string;
  backendTestStarterAccount: string | undefined;
  defaults: {
    vortexEvmPayoutAddress: string | undefined;
  };
  evmDestinationGas: {
    dynamicFundingEnabled: boolean;
    maxExecutionFeeUsd: string;
    networkFeeMarginBps: number;
  };
}

/**
 * Launch subsidy ladder (adr-0005 amendment 2026-09-18): nothing for six minutes, then
 * 10 bps more every two minutes up to 50, then 100 bps from minute sixteen on.
 */
export const DEFAULT_SUBSIDY_LADDER = "0:0,360:10,480:20,600:30,720:40,840:50,960:100";

/** Parses "seconds:bps,seconds:bps,..." into an ascending ladder; throws on anything malformed. */
export function parseSubsidyLadder(raw: string | undefined): Array<{ afterSeconds: number; maxSubsidyBps: number }> {
  const steps = (raw?.trim() || DEFAULT_SUBSIDY_LADDER).split(",").map(entry => {
    const [seconds, bps] = entry.split(":").map(part => Number(part.trim()));
    if (!Number.isInteger(seconds) || seconds < 0 || !Number.isInteger(bps) || bps < 0 || bps > 10_000) {
      throw new Error(`MONERIUM_B2B_SUBSIDY_LADDER entry "${entry}" must be <seconds>:<bps> with bps in 0..10000`);
    }
    return { afterSeconds: seconds, maxSubsidyBps: bps };
  });
  if (steps[0].afterSeconds !== 0) {
    throw new Error("MONERIUM_B2B_SUBSIDY_LADDER must start at 0 seconds");
  }
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].afterSeconds <= steps[i - 1].afterSeconds || steps[i].maxSubsidyBps < steps[i - 1].maxSubsidyBps) {
      throw new Error("MONERIUM_B2B_SUBSIDY_LADDER steps must ascend in both seconds and bps");
    }
  }
  return steps;
}

export const config: Config = {
  adminSecret: process.env.ADMIN_SECRET || "",
  amplitudeWss: process.env.AMPLITUDE_WSS || "wss://rpc-amplitude.pendulumchain.tech",
  backendTestStarterAccount: process.env.BACKEND_TEST_STARTER_ACCOUNT,
  database: {
    database: process.env.DB_NAME || "vortex",
    dialect: "postgres",
    host: process.env.DB_HOST || "localhost",
    logging: nodeEnv !== "production",
    password: process.env.DB_PASSWORD || "postgres",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    username: process.env.DB_USERNAME || "postgres"
  },
  defaults: {
    vortexEvmPayoutAddress: process.env.DEFAULT_VORTEX_EVM_PAYOUT_ADDRESS
  },
  demoAccountEmail: (process.env.DEMO_ACCOUNT_EMAIL || "demo@satoshipay.io").trim().toLowerCase(),
  demoProviderEnabled: process.env.DEMO_PROVIDER_ENABLED === "true",
  deploymentEnv: readDeploymentEnv(),
  env: nodeEnv,
  evmDestinationGas: {
    // Two-phase rollout guard: deploy readers/executors first, then enable quote
    // production only after every worker understands funding program v2.
    dynamicFundingEnabled: process.env.EVM_DYNAMIC_DESTINATION_FUNDING_ENABLED === "true",
    maxExecutionFeeUsd: readPositiveDecimalEnv("EVM_DESTINATION_MAX_EXECUTION_FEE_USD", "5"),
    networkFeeMarginBps: readEvmDestinationNetworkFeeMarginBps()
  },
  flowVariant: readFlowVariant(),
  impersonationEnabled: process.env.IMPERSONATION_ENABLED === "true",

  integrations: {
    alchemy: {
      apiKey: process.env.ALCHEMY_API_KEY
    },
    avenia: {
      webhookUrl: process.env.AVENIA_WEBHOOK_URL
    },
    resend: {
      apiKey: process.env.RESEND_API_KEY,
      fromAddress: process.env.EMAIL_FROM_ADDRESS || "Vortex Finance <support@vortexfinance.co>",
      recipientAllowlist: readEmailAllowlist(),
      replyToAddress: process.env.EMAIL_REPLY_TO_ADDRESS
    },
    slack: {
      userId: process.env.SLACK_USER_ID,
      webhookToken: process.env.SLACK_WEB_HOOK_TOKEN
    }
  },
  logs: nodeEnv === "production" ? "combined" : "dev",
  metricsDashboardSecret: process.env.METRICS_DASHBOARD_SECRET || "",
  monerium: {
    apiUrl:
      process.env.MONERIUM_API_URL ||
      (process.env.SANDBOX_ENABLED === "true" ? "https://api.monerium.dev" : "https://api.monerium.app"),
    clientId: process.env.MONERIUM_CLIENT_ID || "",
    // Kill switch for new EUR pay-in quotes; ramps already registered keep executing.
    eurOnrampEnabled: process.env.EUR_ONRAMP_ENABLED !== "false",
    issueFeeEur: process.env.MONERIUM_ISSUE_FEE_EUR ? readNonNegativeDecimalEnv("MONERIUM_ISSUE_FEE_EUR") : undefined,
    redirectUri: process.env.MONERIUM_REDIRECT_URI || "http://localhost:5174/monerium/callback",
    whiteLabelClientId: process.env.MONERIUM_WHITELABEL_CLIENT_ID || "",
    whiteLabelClientSecret: process.env.MONERIUM_WHITELABEL_CLIENT_SECRET || "",
    widgetRedirectUri: process.env.MONERIUM_WIDGET_REDIRECT_URI || undefined
  },
  moneriumB2b: {
    // Whitelabel API credentials and base URL live with the shared client
    // (MONERIUM_WHITELABEL_CLIENT_ID/SECRET, MONERIUM_API_URL — @vortexfi/shared);
    // this block keeps only the chain/keeper-specific settings.
    attestorPrivateKey: process.env.MONERIUM_B2B_ATTESTOR_PRIVATE_KEY,
    autoRecovery: (["alert", "auto"].includes(process.env.MONERIUM_B2B_AUTO_RECOVERY ?? "")
      ? process.env.MONERIUM_B2B_AUTO_RECOVERY
      : "off") as "off" | "alert" | "auto",
    enabled: process.env.MONERIUM_B2B_ENABLED === "true",
    floatPrivateKey: process.env.MONERIUM_B2B_FLOAT_PRIVATE_KEY,
    forwarderFactoryAddress: process.env.MONERIUM_B2B_FORWARDER_FACTORY_ADDRESS,
    // Dormancy-gate pause key (guardian on the factory/forwarders). Distinct from the
    // keeper and attestor keys by design; unset = log-only mode for the dormancy gate.
    guardianPrivateKey: process.env.MONERIUM_B2B_GUARDIAN_PRIVATE_KEY,
    keeperCycleSeconds: Number(process.env.MONERIUM_B2B_KEEPER_CYCLE_SECONDS || 20),
    keeperPrivateKey: process.env.MONERIUM_B2B_KEEPER_PRIVATE_KEY,
    // Private-orderflow submission endpoint (e.g. https://rpc.flashbots.net); when unset
    // the keeper falls back to the public RPC and logs a warning (see chain.ts).
    privateRpcUrl: process.env.MONERIUM_B2B_PRIVATE_RPC_URL,
    recoveryDeadlineMinutes: Number(process.env.MONERIUM_B2B_RECOVERY_DEADLINE_MINUTES || 120),
    recoveryPrivateKey: process.env.MONERIUM_B2B_RECOVERY_PRIVATE_KEY,
    rpcUrl: process.env.MONERIUM_B2B_RPC_URL,
    subsidyLadder: parseSubsidyLadder(process.env.MONERIUM_B2B_SUBSIDY_LADDER),
    webhookSecret: process.env.MONERIUM_B2B_WEBHOOK_SECRET || ""
  },
  mykobo: {
    feeFallback: readMykoboFeeFallback()
  },
  pendulumWss: process.env.PENDULUM_WSS || "wss://rpc-pendulum.prd.pendulumchain.tech",
  port: process.env.PORT || 3000,
  priceProviders: {
    alchemyPay: {
      appId: process.env.ALCHEMYPAY_APP_ID,
      baseUrl: process.env.ALCHEMYPAY_PROD_URL || "https://openapi.alchemypay.org",
      secretKey: process.env.ALCHEMYPAY_SECRET_KEY
    },
    binance: {
      baseUrl: process.env.BINANCE_API_URL || "https://api.binance.com"
    },
    coingecko: {
      apiKey: process.env.COINGECKO_API_KEY,
      baseUrl: process.env.COINGECKO_API_URL || "https://pro-api.coingecko.com/api/v3",
      cryptoCacheTtlMs: parseInt(process.env.CRYPTO_CACHE_TTL_MS || "300000", 10),
      fiatCacheTtlMs: parseInt(process.env.FIAT_CACHE_TTL_MS || "300000", 10)
    },
    fastforex: {
      apiKey: process.env.FASTFOREX_API_KEY,
      baseUrl: process.env.FASTFOREX_API_URL || "https://api.fastforex.io"
    },
    moonpay: {
      apiKey: process.env.MOONPAY_API_KEY,
      baseUrl: process.env.MOONPAY_PROD_URL || "https://api.moonpay.com"
    },
    transak: {
      baseUrl: process.env.TRANSAK_PROD_URL || "https://api.transak.com",
      partnerApiKey: process.env.TRANSAK_API_KEY
    }
  },
  quote: {
    deltaDBasisPoints: parseFloat(process.env.DELTA_D_BASIS_POINTS || "0.3"),
    discountStateTimeoutMinutes: parseInt(process.env.DISCOUNT_STATE_TIMEOUT_MINUTES || "10", 10)
  },
  rampWidgetUrl: process.env.RAMP_WIDGET_URL || "https://www.vortexfinance.co/widget",
  rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS || 100,
  rateLimitNumberOfProxies: process.env.RATE_LIMIT_NUMBER_OF_PROXIES || 1,
  rateLimitWindowMinutes: process.env.RATE_LIMIT_WINDOW_MINUTES || 1,
  recipients: {
    inviteMaxDiscountBps: readRecipientInviteDiscountLimit()
  },

  sandboxEnabled: process.env.SANDBOX_ENABLED === "true",

  secrets: {
    moonbeamExecutorPrivateKey: process.env.MOONBEAM_EXECUTOR_PRIVATE_KEY,
    pendulumFundingSeed: process.env.PENDULUM_FUNDING_SEED,
    webhookPrivateKey: process.env.WEBHOOK_PRIVATE_KEY
  },
  spreadsheet: {
    contactSheetId: process.env.GOOGLE_CONTACT_SPREADSHEET_ID,
    emailSheetId: process.env.GOOGLE_EMAIL_SPREADSHEET_ID,
    googleCredentials: {
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY?.split(String.raw`\n`).join("\n")
    },
    ratingSheetId: process.env.GOOGLE_RATING_SPREADSHEET_ID,
    storageSheetId: process.env.GOOGLE_SPREADSHEET_ID
  },
  subscanApiKey: process.env.SUBSCAN_API_KEY,

  subsidy: {
    evmPostSwapDiscountSubsidyQuoteFraction: readFractionEnv("MAX_EVM_POST_SWAP_DISCOUNT_SUBSIDY_QUOTE_FRACTION", "0.05"),
    evmSwapSubsidyQuoteFraction: readFractionEnv("MAX_EVM_SWAP_SUBSIDY_QUOTE_FRACTION", "0.05")
  },
  supabase: {
    anonKey: process.env.SUPABASE_ANON_KEY || "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_KEY || "",
    url: process.env.SUPABASE_URL || ""
  },
  swap: {
    deadlineMinutes: 60 * 24 * 7 // 1 week
  },
  vortexFeePenPercentage: parseFloat(process.env.VORTEX_FEE_PEN_PERCENTAGE || "0.0")
};

export const EVM_FUNDING_PRIVATE_KEY = process.env.EVM_FUNDING_PRIVATE_KEY ?? config.secrets.moonbeamExecutorPrivateKey;

if (config.sandboxEnabled && config.deploymentEnv !== "sandbox") {
  throw new Error(`SANDBOX_ENABLED=true requires DEPLOYMENT_ENV=sandbox (got '${config.deploymentEnv}'); refusing to start`);
}

if (config.deploymentEnv === "sandbox" && !config.sandboxEnabled) {
  throw new Error("DEPLOYMENT_ENV=sandbox requires SANDBOX_ENABLED=true");
}

if (config.demoProviderEnabled && config.deploymentEnv !== "sandbox") {
  throw new Error(
    `DEMO_PROVIDER_ENABLED=true requires DEPLOYMENT_ENV=sandbox (got '${config.deploymentEnv}'); refusing to start`
  );
}

if (config.moneriumB2b.enabled) {
  if (config.flowVariant !== "mykobo") {
    throw new Error("MONERIUM_B2B_ENABLED=true requires FLOW_VARIANT=mykobo");
  }

  const missing: string[] = [];
  if (!process.env.MONERIUM_WHITELABEL_CLIENT_ID) missing.push("MONERIUM_WHITELABEL_CLIENT_ID");
  if (!process.env.MONERIUM_WHITELABEL_CLIENT_SECRET) missing.push("MONERIUM_WHITELABEL_CLIENT_SECRET");
  if (!config.moneriumB2b.attestorPrivateKey) missing.push("MONERIUM_B2B_ATTESTOR_PRIVATE_KEY");
  if (!config.moneriumB2b.guardianPrivateKey) missing.push("MONERIUM_B2B_GUARDIAN_PRIVATE_KEY");
  if (!config.moneriumB2b.keeperPrivateKey) missing.push("MONERIUM_B2B_KEEPER_PRIVATE_KEY");
  if (!config.moneriumB2b.rpcUrl) missing.push("MONERIUM_B2B_RPC_URL");
  if (!config.moneriumB2b.webhookSecret) missing.push("MONERIUM_B2B_WEBHOOK_SECRET");
  if (!config.moneriumB2b.forwarderFactoryAddress) missing.push("MONERIUM_B2B_FORWARDER_FACTORY_ADDRESS");
  if (config.deploymentEnv === "production" && !config.moneriumB2b.privateRpcUrl) {
    missing.push("MONERIUM_B2B_PRIVATE_RPC_URL");
  }
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables for Monerium B2B: ${missing.join(", ")}`);
  }

  if (
    !/^0x[0-9a-fA-F]{40}$/.test(config.moneriumB2b.forwarderFactoryAddress as string) ||
    /^0x0{40}$/i.test(config.moneriumB2b.forwarderFactoryAddress as string)
  ) {
    throw new Error("MONERIUM_B2B_FORWARDER_FACTORY_ADDRESS must be a valid EVM address");
  }
  if (config.moneriumB2b.autoRecovery === "auto") {
    const missingRecovery: string[] = [];
    if (!config.moneriumB2b.recoveryPrivateKey) missingRecovery.push("MONERIUM_B2B_RECOVERY_PRIVATE_KEY");
    if (!config.moneriumB2b.floatPrivateKey) missingRecovery.push("MONERIUM_B2B_FLOAT_PRIVATE_KEY");
    if (missingRecovery.length > 0) {
      throw new Error(`MONERIUM_B2B_AUTO_RECOVERY=auto requires ${missingRecovery.join(", ")}`);
    }
  }
  if (!Number.isInteger(config.moneriumB2b.recoveryDeadlineMinutes) || config.moneriumB2b.recoveryDeadlineMinutes <= 0) {
    throw new Error("MONERIUM_B2B_RECOVERY_DEADLINE_MINUTES must be a positive integer");
  }
  if (!Number.isInteger(config.moneriumB2b.keeperCycleSeconds) || config.moneriumB2b.keeperCycleSeconds < 5) {
    throw new Error("MONERIUM_B2B_KEEPER_CYCLE_SECONDS must be an integer of at least 5");
  }
  for (const [name, value] of [
    ["MONERIUM_B2B_ATTESTOR_PRIVATE_KEY", config.moneriumB2b.attestorPrivateKey],
    ["MONERIUM_B2B_GUARDIAN_PRIVATE_KEY", config.moneriumB2b.guardianPrivateKey],
    ["MONERIUM_B2B_KEEPER_PRIVATE_KEY", config.moneriumB2b.keeperPrivateKey],
    ...(config.moneriumB2b.recoveryPrivateKey
      ? ([["MONERIUM_B2B_RECOVERY_PRIVATE_KEY", config.moneriumB2b.recoveryPrivateKey]] as const)
      : []),
    ...(config.moneriumB2b.floatPrivateKey
      ? ([["MONERIUM_B2B_FLOAT_PRIVATE_KEY", config.moneriumB2b.floatPrivateKey]] as const)
      : [])
  ] as const) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(value as string)) {
      throw new Error(`${name} must be a 32-byte 0x-prefixed private key`);
    }
  }
  const b2bKeys = [
    config.moneriumB2b.attestorPrivateKey,
    config.moneriumB2b.guardianPrivateKey,
    config.moneriumB2b.keeperPrivateKey
  ].map(value => (value as string).toLowerCase());
  if (new Set(b2bKeys).size !== b2bKeys.length) {
    throw new Error("Monerium B2B attestor, guardian, and keeper private keys must be distinct");
  }
  const encodedWebhookSecret = config.moneriumB2b.webhookSecret.slice("whsec_".length);
  const decodedWebhookSecret = Buffer.from(encodedWebhookSecret, "base64");
  if (
    !config.moneriumB2b.webhookSecret.startsWith("whsec_") ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encodedWebhookSecret) ||
    decodedWebhookSecret.length < 24 ||
    decodedWebhookSecret.length > 64
  ) {
    throw new Error("MONERIUM_B2B_WEBHOOK_SECRET must encode 24-64 bytes using whsec_<base64>");
  }
}

if (config.env === "production") {
  const missing: string[] = [];

  if (!config.supabase.url) missing.push("SUPABASE_URL");
  if (!config.supabase.anonKey) missing.push("SUPABASE_ANON_KEY");
  if (!config.supabase.serviceRoleKey) missing.push("SUPABASE_SERVICE_KEY");
  if (!config.secrets.webhookPrivateKey) missing.push("WEBHOOK_PRIVATE_KEY");
  if (!config.adminSecret) missing.push("ADMIN_SECRET");
  if (!config.metricsDashboardSecret) missing.push("METRICS_DASHBOARD_SECRET");
  if (!process.env.FLOW_VARIANT) missing.push("FLOW_VARIANT");
  if (!config.monerium.clientId) missing.push("MONERIUM_CLIENT_ID");
  if (!config.monerium.issueFeeEur) missing.push("MONERIUM_ISSUE_FEE_EUR");
  if (!process.env.MONERIUM_REDIRECT_URI) missing.push("MONERIUM_REDIRECT_URI");
  // The white-label pair is optional: without it every Monerium read uses the user's OAuth token.

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables in production: ${missing.join(", ")}`);
  }
}
