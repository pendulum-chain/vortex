import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import '@rainbow-me/rainbowkit/styles.css';

import { render } from 'preact';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material';
import { connectorsForWallets, getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { polygon } from 'wagmi/chains';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { App } from './app';
import defaultTheme from './theme';
import { GlobalState, GlobalStateContext, GlobalStateProvider } from './GlobalStateProvider';
import { walletConnectWallet } from '@rainbow-me/rainbowkit/wallets';
import { injectedWallet } from '@rainbow-me/rainbowkit/wallets';
import { safeWallet } from '@rainbow-me/rainbowkit/wallets';
import { createClient } from 'viem';

const queryClient = new QueryClient();

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [injectedWallet, safeWallet, walletConnectWallet],
    },
  ],
  {
    appName: 'Vortex',
    projectId: '495a5f574d57e27fd65caa26d9ea4f10',
  },
);

const defaultConfig = getDefaultConfig({
  appName: 'Vortex',
  projectId: '495a5f574d57e27fd65caa26d9ea4f10',
  chains: [polygon],
  ssr: false, // If your dApp uses server side rendering (SSR)
});

const config = createConfig({
  client({ chain }) {
    return createClient({
      chain,
      transport: http(),
    });
  },
  chains: defaultConfig.chains,
  connectors,
  ssr: false,
});

render(
  <QueryClientProvider client={queryClient}>
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
    </ThemeProvider>
  </QueryClientProvider>,
  document.getElementById('app') as HTMLElement,
);
