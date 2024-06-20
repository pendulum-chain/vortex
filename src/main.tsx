import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import '@rainbow-me/rainbowkit/styles.css';

import { render } from 'preact';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material';
import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { polygon, base } from 'wagmi/chains';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { App } from './app';
import defaultTheme from './theme';
import { GlobalState, GlobalStateContext, GlobalStateProvider } from './GlobalStateProvider';

const config = getDefaultConfig({
  appName: 'Vortex',
  projectId: 'YOUR_PROJECT_ID',
  chains: [polygon, base],
  ssr: false, // If your dApp uses server side rendering (SSR)
});

const queryClient = new QueryClient();

render(
  <ThemeProvider theme={defaultTheme}>
    <BrowserRouter>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider>
            <GlobalStateProvider>
              <GlobalStateContext.Consumer>
                {(globalState) => {
                  const { tenantRPC, getThemeName = () => undefined } = globalState as GlobalState;
                  return <App />;
                }}
              </GlobalStateContext.Consumer>
            </GlobalStateProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </BrowserRouter>
  </ThemeProvider>,
  document.getElementById('app') as HTMLElement,
);
