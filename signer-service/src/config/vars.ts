import path from 'path';
import dotenv from 'dotenv';

dotenv.config({
  path: path.join(__dirname, '../../.env'),
});

interface QuoteProvider {
  baseUrl: string;
  appId?: string;
  secretKey?: string;
  partnerApiKey?: string;
  apiKey?: string;
}

/**
 * The GoogleCredentials interface is the same as in the signer-service/.../spreadsheet.service.ts
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
  quoteProviders: {
    alchemyPay: QuoteProvider;
    transak: QuoteProvider;
    moonpay: QuoteProvider;
  };
  spreadsheet: SpreadsheetConfig;
}

export const config: Config = {
  env: process.env.NODE_ENV || 'production',
  port: process.env.PORT || 3000,
  amplitudeWss: process.env.AMPLITUDE_WSS || 'wss://rpc-amplitude.pendulumchain.tech',
  pendulumWss: process.env.PENDULUM_WSS || 'wss://rpc-pendulum.prd.pendulumchain.tech',
  rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS || 100,
  rateLimitWindowMinutes: process.env.RATE_LIMIT_WINDOW_MINUTES || 1,
  rateLimitNumberOfProxies: process.env.RATE_LIMIT_NUMBER_OF_PROXIES || 1,
  logs: process.env.NODE_ENV === 'production' ? 'combined' : 'dev',
  quoteProviders: {
    alchemyPay: {
      baseUrl: process.env.ALCHEMYPAY_PROD_URL || 'https://openapi.alchemypay.org',
      appId: process.env.ALCHEMYPAY_APP_ID,
      secretKey: process.env.ALCHEMYPAY_SECRET_KEY,
    },
    transak: {
      baseUrl: process.env.TRANSAK_PROD_URL || 'https://api.transak.com',
      partnerApiKey: process.env.TRANSAK_API_KEY,
    },
    moonpay: {
      baseUrl: process.env.MOONPAY_PROD_URL || 'https://api.moonpay.com',
      apiKey: process.env.MOONPAY_API_KEY,
    },
  },
  spreadsheet: {
    googleCredentials: {
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY?.split(String.raw`\n`).join('\n'),
    },
    storageSheetId: process.env.GOOGLE_SPREADSHEET_ID,
    emailSheetId: process.env.GOOGLE_EMAIL_SPREADSHEET_ID,
    ratingSheetId: process.env.GOOGLE_RATING_SPREADSHEET_ID,
  },
};
