import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

import { render } from 'preact';
import { BrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { EventsProvider } from './contexts/events';
import { NetworkProvider } from './contexts/network';
import { wagmiConfig } from './wagmiConfig';
import { SiweProvider } from './contexts/siwe';
import { config } from './config';
import { App } from './app';
import { PolkadotWalletStateProvider } from './contexts/polkadotWallet';

const queryClient = new QueryClient();

// Boilerplate code for Sentry
Sentry.init({
  dsn: 'https://7eb35f175ccba5b5e2eb1ca00e64e053@o4508217222692864.ingest.de.sentry.io/4508217730269264',
  enabled: !window.location.hostname.includes('localhost'), // Disable sentry entirely when testing locally
  environment: config.isProd ? 'production' : 'development',
  integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
  // Tracing
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
  // We allow all to account for different Netlify URLs which are dependant on the branch name
  tracePropagationTargets: ['*'],
  // Session Replay
  replaysSessionSampleRate: 1.0, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
  replaysOnErrorSampleRate: 1.0, // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
});

render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <EventsProvider>
            <SiweProvider>
              <NetworkProvider>
                <PolkadotWalletStateProvider>
                  <App />
                </PolkadotWalletStateProvider>
              </NetworkProvider>
            </SiweProvider>
          </EventsProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </BrowserRouter>
  </QueryClientProvider>,
  document.getElementById('app') as HTMLElement,
);
