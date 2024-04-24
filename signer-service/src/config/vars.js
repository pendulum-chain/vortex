const path = require("path");

// import .env variables
require("dotenv-safe").config({
  path: path.join(__dirname, "../../.env"),
});

module.exports = {
  env: process.env.NODE_ENV || "production",
  port: process.env.PORT || 3000,
  amplitudeWss:
    process.env.AMPLITUDE_WSS || "wss://rpc-amplitude.pendulumchain.tech",
  pendulumWss:
    process.env.PENDULUM_WSS || "wss://rpc-pendulum.prd.pendulumchain.tech",
  cacheEndpoint: process.env.CACHE_URI || "http://localhost:11211",
  cacheLifetime: process.env.CACHE_LIFETIME_SECONDS || 600,
  rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS || 100,
  rateLimitWindowMinutes: process.env.RATE_LIMIT_WINDOW_MINUTES || 15,
  rateLimitNumberOfProxies: process.env.RATE_LIMIT_NUMBER_OF_PROXIES || 1,
  logs: process.env.NODE_ENV === "production" ? "combined" : "dev",
};
