type Environment = "development" | "staging" | "production";
const nodeEnv = process.env.NODE_ENV as Environment;
const maybeSignerServiceUrl = import.meta.env.VITE_SIGNING_SERVICE_PATH;
const alchemyApiKey = import.meta.env.VITE_ALCHEMY_API_KEY;
const sandboxEnabled = import.meta.env.VITE_SANDBOX_ENABLED === "true";
const env = (import.meta.env.VITE_ENVIRONMENT || nodeEnv) as Environment;

export const config = {
  alchemyApiKey,
  env,
  isProd: env === "production",
  isSandbox: sandboxEnabled,
  maybeSignerServiceUrl,
  supportUrl: "https://forms.gle/bgH4XTTbQ3YbwQ3t7",
  test: {
    overwriteMinimumTransferAmount: false
  },
  walletConnect: {
    projectId: "495a5f574d57e27fd65caa26d9ea4f10",
    url: "wss://relay.walletconnect.com"
  }
};
