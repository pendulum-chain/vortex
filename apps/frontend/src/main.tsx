import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";

import * as Sentry from "@sentry/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";

import { App } from "./app";
import { config } from "./config";
import { EventsProvider } from "./contexts/events";
import { NetworkProvider } from "./contexts/network";
import { PolkadotNodeProvider } from "./contexts/polkadotNode";
import { PolkadotWalletStateProvider } from "./contexts/polkadotWallet";
import { wagmiConfig } from "./wagmiConfig";
import "./helpers/googleTranslate";
import { PersistentRampStateProvider } from "./contexts/rampState";

const queryClient = new QueryClient();

// Boilerplate code for Sentry
Sentry.init({
  dsn: "https://7eb35f175ccba5b5e2eb1ca00e64e053@o4508217222692864.ingest.de.sentry.io/4508217730269264",
  enabled: !window.location.hostname.includes("localhost"), // Disable sentry entirely when testing locally
  environment: config.isProd ? "production" : "development",
  integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
  replaysOnErrorSampleRate: 1.0, // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur. //  Capture 100% of the transactions
  // Session Replay
  replaysSessionSampleRate: 1.0,
  // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
  // We allow all to account for different Netlify URLs which are dependant on the branch name
  tracePropagationTargets: ["*"], // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
  // Tracing
  tracesSampleRate: 1.0
});

const root = document.getElementById("app");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <WagmiProvider config={wagmiConfig}>
      <PersistentRampStateProvider>
        <NetworkProvider>
          <PolkadotNodeProvider>
            <PolkadotWalletStateProvider>
              <EventsProvider>
                <App />
              </EventsProvider>
            </PolkadotWalletStateProvider>
          </PolkadotNodeProvider>
        </NetworkProvider>
      </PersistentRampStateProvider>
    </WagmiProvider>
  </QueryClientProvider>
);
