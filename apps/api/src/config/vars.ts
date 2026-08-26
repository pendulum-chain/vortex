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

// Display-only fallback so EUR quotes still render when the Mykobo /fees endpoint is
// down. Never prices a ramp execution: EUR ramp start is currently blocked entirely by
// the register-time kill-switch (registerRamp rejects EURC quotes with 503). When EUR is
// re-enabled, ramp start must re-validate the live Mykobo fee before executing — no such
// check exists today. Both fees are flat EUR amounts and are required when enabled.
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
    throw new Error(`${name} is required when MYKOBO_FEE_FALLBACK_ENABLED=true`);
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
    redirectUri: string;
  };
  // B2B whitelabel onramp integration (docs/prd/monerium-b2b-implementation-plan.md §3).
  // Separate credential set from the legacy consumer OAuth integration above.
  moneriumB2b: {
    attestorPrivateKey: string | undefined;
    guardianPrivateKey: string | undefined;
    keeperPrivateKey: string | undefined;
    privateRpcUrl: string | undefined;
    rpcUrl: string | undefined;
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
    redirectUri: process.env.MONERIUM_REDIRECT_URI || "http://localhost:5174/monerium/callback"
  },
  moneriumB2b: {
    // Whitelabel API credentials and base URL live with the shared client
    // (MONERIUM_WHITELABEL_CLIENT_ID/SECRET, MONERIUM_API_URL — @vortexfi/shared);
    // this block keeps only the chain/keeper-specific settings.
    attestorPrivateKey: process.env.MONERIUM_B2B_ATTESTOR_PRIVATE_KEY,
    // Dormancy-gate pause key (guardian on the factory/forwarders). Distinct from the
    // keeper and attestor keys by design; unset = log-only mode for the dormancy gate.
    guardianPrivateKey: process.env.MONERIUM_B2B_GUARDIAN_PRIVATE_KEY,
    keeperPrivateKey: process.env.MONERIUM_B2B_KEEPER_PRIVATE_KEY,
    // Private-orderflow submission endpoint (e.g. https://rpc.flashbots.net); when unset
    // the keeper falls back to the public RPC and logs a warning (see chain.ts).
    privateRpcUrl: process.env.MONERIUM_B2B_PRIVATE_RPC_URL,
    rpcUrl: process.env.MONERIUM_B2B_RPC_URL,
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
  if (!process.env.MONERIUM_REDIRECT_URI) missing.push("MONERIUM_REDIRECT_URI");

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables in production: ${missing.join(", ")}`);
  }
}
