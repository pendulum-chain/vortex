type Environment = "development" | "staging" | "production";
const nodeEnv = process.env.NODE_ENV as Environment;
const maybeSignerServiceUrl = import.meta.env.VITE_SIGNING_SERVICE_PATH;
const alchemyApiKey = import.meta.env.VITE_ALCHEMY_API_KEY;
const env = (import.meta.env.VITE_ENVIRONMENT || nodeEnv) as Environment;

export const config = {
  nodeEnv,
  env,
  isProd: env === "production",
  isDev: env === "development",
  maybeSignerServiceUrl,
  alchemyApiKey,
  swap: {
    deadlineMinutes: 60 * 24 * 7 // 1 week
  },
  walletConnect: {
    url: "wss://relay.walletconnect.com",
    projectId: "495a5f574d57e27fd65caa26d9ea4f10"
  },
  test: {
    mockSep24: false,
    overwriteMinimumTransferAmount: false
  },
  supportUrl: "https://forms.gle/bgH4XTTbQ3YbwQ3t7",
  applicationClientDomain: "satoshipay.io"
};
