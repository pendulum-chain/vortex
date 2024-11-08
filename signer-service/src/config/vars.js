const path = require('path');

// import .env variables
require('dotenv').config({
  path: path.join(__dirname, '../../.env'),
});

module.exports = {
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
