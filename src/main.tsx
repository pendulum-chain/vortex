import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import '@rainbow-me/rainbowkit/styles.css';

import { render } from 'preact';
import { BrowserRouter } from 'react-router-dom';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './app';
import { GlobalStateContext, GlobalStateProvider } from './GlobalStateProvider';
import { wagmiConfig } from './wagmiConfig';
import { EventsProvider } from './contexts/events';
import * as Sentry from '@sentry/react';

const queryClient = new QueryClient();

// Boilerplate code for Sentry
Sentry.init({
  dsn: 'https://7eb35f175ccba5b5e2eb1ca00e64e053@o4508217222692864.ingest.de.sentry.io/4508217730269264',
  integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
  // Tracing
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
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
          <RainbowKitProvider>
            <EventsProvider>
              <GlobalStateProvider>
                <GlobalStateContext.Consumer>
                  {() => {
                    return <App />;
                  }}
                </GlobalStateContext.Consumer>
              </GlobalStateProvider>
            </EventsProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </BrowserRouter>
  </QueryClientProvider>,
  document.getElementById('app') as HTMLElement,
);
