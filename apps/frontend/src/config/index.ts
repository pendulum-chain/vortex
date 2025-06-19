type Environment = "development" | "staging" | "production";
const nodeEnv = process.env.NODE_ENV as Environment;
const maybeSignerServiceUrl = import.meta.env.VITE_SIGNING_SERVICE_PATH;
const alchemyApiKey = import.meta.env.VITE_ALCHEMY_API_KEY;
const env = (import.meta.env.VITE_ENVIRONMENT || nodeEnv) as Environment;

export const config = {
  alchemyApiKey,
  applicationClientDomain: "satoshipay.io",
  env,
  isDev: env === "development",
  isProd: env === "production",
  maybeSignerServiceUrl,
  nodeEnv,
  supportUrl: "https://forms.gle/bgH4XTTbQ3YbwQ3t7",
  swap: {
    deadlineMinutes: 60 * 24 * 7 // 1 week
  },
  test: {
    mockSep24: false,
    overwriteMinimumTransferAmount: false
  },
  walletConnect: {
    projectId: "495a5f574d57e27fd65caa26d9ea4f10",
    url: "wss://relay.walletconnect.com"
  }
};
