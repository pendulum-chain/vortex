import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "react-toastify/dist/ReactToastify.css";
import "../App.css";

import * as Sentry from "@sentry/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import i18n from "i18next";
import { createRoot } from "react-dom/client";
import { initReactI18next } from "react-i18next";
import { WagmiProvider } from "wagmi";
import { config } from "./config";
import { EventsProvider } from "./contexts/events";
import { NetworkProvider } from "./contexts/network";
import { PolkadotNodeProvider } from "./contexts/polkadotNode";
import { PolkadotWalletStateProvider } from "./contexts/polkadotWallet";
import { initializeEvmTokens } from "./services/tokens";
import { useEvmTokensStore } from "./stores/evmTokensStore";
import { wagmiConfig } from "./wagmiConfig";
import "./helpers/googleTranslate";
import { PersistentRampStateProvider } from "./contexts/rampState";
import { routeTree } from "./routeTree.gen";
import enTranslations from "./translations/en.json";
import { getBrowserLanguage, Language } from "./translations/helpers";
import ptTranslations from "./translations/pt.json";

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

// Initialize i18n with browser language as default
// The actual language will be set by the route's beforeLoad
const lng = getBrowserLanguage();

i18n.use(initReactI18next).init({
  fallbackLng: "en",
  lng,
  resources: {
    [Language.English]: {
      translation: enTranslations
    },
    [Language.Portuguese_Brazil]: {
      translation: ptTranslations
    }
  }
});

const router = createRouter({ routeTree, scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("app");

if (!root) {
  throw new Error("Root element not found");
}

// Initialize dynamic EVM tokens from SquidRouter API (falls back to static config on failure)
initializeEvmTokens().then(() => {
  useEvmTokensStore.getState().setLoaded();
});

createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <ReactQueryDevtools initialIsOpen={false} />
    <WagmiProvider config={wagmiConfig}>
      <PersistentRampStateProvider>
        <NetworkProvider>
          <PolkadotNodeProvider>
            <PolkadotWalletStateProvider>
              <EventsProvider>
                <RouterProvider router={router} />
              </EventsProvider>
            </PolkadotWalletStateProvider>
          </PolkadotNodeProvider>
        </NetworkProvider>
      </PersistentRampStateProvider>
    </WagmiProvider>
  </QueryClientProvider>
);
