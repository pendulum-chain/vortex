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
  ratingSheetId: string | undefined;
}

interface Config {
  env: string;
  port: string | number;
  amplitudeWss: string;
  pendulumWss: string;
  rateLimitMaxRequests: string | number;
  rateLimitWindowMinutes: string | number;
  rateLimitNumberOfProxies: string | number;
  logs: string;
  adminSecret: string;
  priceProviders: {
    alchemyPay: PriceProvider;
    transak: PriceProvider;
    moonpay: PriceProvider;
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
  quote: {
    discountStateTimeoutMinutes: number;
    deltaDBasisPoints: number;
  };
  supabaseKey: string | undefined;
  supabaseUrl: string | undefined;
  subscanApiKey: string | undefined;
  vortexFeePenPercentage: number;
}

export const config: Config = {
  adminSecret: process.env.ADMIN_SECRET || "",
  amplitudeWss: process.env.AMPLITUDE_WSS || "wss://rpc-amplitude.pendulumchain.tech",
  database: {
    database: process.env.DB_NAME || "vortex",
    dialect: "postgres",
    host: process.env.DB_HOST || "localhost",
    logging: process.env.NODE_ENV !== "production",
    password: process.env.DB_PASSWORD || "postgres",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    username: process.env.DB_USERNAME || "postgres"
  },
  env: process.env.NODE_ENV || "production",
  logs: process.env.NODE_ENV === "production" ? "combined" : "dev",
  pendulumWss: process.env.PENDULUM_WSS || "wss://rpc-pendulum.prd.pendulumchain.tech",
  port: process.env.PORT || 3000,
  priceProviders: {
    alchemyPay: {
      appId: process.env.ALCHEMYPAY_APP_ID,
      baseUrl: process.env.ALCHEMYPAY_PROD_URL || "https://openapi.alchemypay.org",
      secretKey: process.env.ALCHEMYPAY_SECRET_KEY
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
  rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS || 100,
  rateLimitNumberOfProxies: process.env.RATE_LIMIT_NUMBER_OF_PROXIES || 1,
  rateLimitWindowMinutes: process.env.RATE_LIMIT_WINDOW_MINUTES || 1,
  spreadsheet: {
    emailSheetId: process.env.GOOGLE_EMAIL_SPREADSHEET_ID,
    googleCredentials: {
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY?.split(String.raw`\n`).join("\n")
    },
    ratingSheetId: process.env.GOOGLE_RATING_SPREADSHEET_ID,
    storageSheetId: process.env.GOOGLE_SPREADSHEET_ID
  },
  subscanApiKey: process.env.SUBSCAN_API_KEY,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY,
  supabaseUrl: process.env.SUPABASE_URL,
  swap: {
    deadlineMinutes: 60 * 24 * 7 // 1 week
  },
  vortexFeePenPercentage: parseFloat(process.env.VORTEX_FEE_PEN_PERCENTAGE || "0.0")
};
