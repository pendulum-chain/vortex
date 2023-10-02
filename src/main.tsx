import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from 'preact';
import { Theme } from 'react-daisyui';
import { BrowserRouter } from 'react-router-dom';
import { GlobalState, GlobalStateContext, GlobalStateProvider } from './GlobalStateProvider';
import { NodeInfoProvider } from './NodeInfoProvider';
import SharedProvider from './SharedProvider';
import { App } from './app';
import { emptyFn } from './helpers/general';
import './index.css';
import { ThemeName, tenantTheme } from './models/Theme';

const queryClient = new QueryClient();

render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <GlobalStateProvider>
        <GlobalStateContext.Consumer>
          {(globalState) => {
            const { tenantRPC, getThemeName = emptyFn } = globalState as GlobalState;
            return (
              <NodeInfoProvider tenantRPC={tenantRPC}>
                <SharedProvider>
                  <Theme dataTheme={`${getThemeName()}`} className={tenantTheme[getThemeName() || ThemeName.Pendulum]}>
                    <App />
                  </Theme>
                </SharedProvider>
              </NodeInfoProvider>
            );
          }}
        </GlobalStateContext.Consumer>
      </GlobalStateProvider>
    </BrowserRouter>
  </QueryClientProvider>,
  document.getElementById('app') as HTMLElement,
);
