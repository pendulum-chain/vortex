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

interface Config {
  env: string;
  deploymentEnv: DeploymentEnv;
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
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
  };
  priceProviders: {
    alchemyPay: PriceProvider;
    transak: PriceProvider;
    moonpay: PriceProvider;
    coingecko: {
      apiKey: string | undefined;
      baseUrl: string;
      cryptoCacheTtlMs: number;
      fiatCacheTtlMs: number;
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
  subscanApiKey: string | undefined;
  vortexFeePenPercentage: number;

  secrets: {
    pendulumFundingSeed: string | undefined;
    moonbeamExecutorPrivateKey: string | undefined;
    clientDomainSecret: string | undefined;
    webhookPrivateKey: string | undefined;
  };

  integrations: {
    alchemy: {
      apiKey: string | undefined;
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
  deploymentEnv: readDeploymentEnv(),
  env: nodeEnv,
  flowVariant: readFlowVariant(),

  integrations: {
    alchemy: {
      apiKey: process.env.ALCHEMY_API_KEY
    },
    slack: {
      userId: process.env.SLACK_USER_ID,
      webhookToken: process.env.SLACK_WEB_HOOK_TOKEN
    }
  },
  logs: nodeEnv === "production" ? "combined" : "dev",
  metricsDashboardSecret: process.env.METRICS_DASHBOARD_SECRET || "",
  pendulumWss: process.env.PENDULUM_WSS || "wss://rpc-pendulum.prd.pendulumchain.tech",
  port: process.env.PORT || 3000,
  priceProviders: {
    alchemyPay: {
      appId: process.env.ALCHEMYPAY_APP_ID,
      baseUrl: process.env.ALCHEMYPAY_PROD_URL || "https://openapi.alchemypay.org",
      secretKey: process.env.ALCHEMYPAY_SECRET_KEY
    },
    coingecko: {
      apiKey: process.env.COINGECKO_API_KEY,
      baseUrl: process.env.COINGECKO_API_URL || "https://pro-api.coingecko.com/api/v3",
      cryptoCacheTtlMs: parseInt(process.env.CRYPTO_CACHE_TTL_MS || "300000", 10),
      fiatCacheTtlMs: parseInt(process.env.FIAT_CACHE_TTL_MS || "300000", 10)
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

  sandboxEnabled: process.env.SANDBOX_ENABLED === "true",

  secrets: {
    clientDomainSecret: process.env.CLIENT_DOMAIN_SECRET,
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

if (config.env === "production") {
  const missing: string[] = [];

  if (!config.supabase.url) missing.push("SUPABASE_URL");
  if (!config.supabase.anonKey) missing.push("SUPABASE_ANON_KEY");
  if (!config.supabase.serviceRoleKey) missing.push("SUPABASE_SERVICE_KEY");
  if (!config.secrets.webhookPrivateKey) missing.push("WEBHOOK_PRIVATE_KEY");
  if (!config.adminSecret) missing.push("ADMIN_SECRET");
  if (!config.metricsDashboardSecret) missing.push("METRICS_DASHBOARD_SECRET");
  if (!process.env.FLOW_VARIANT) missing.push("FLOW_VARIANT");

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables in production: ${missing.join(", ")}`);
  }
}
