import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

import { render } from 'preact';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material';
import { App } from './app';
import defaultTheme from './theme';
import { GlobalState, GlobalStateContext, GlobalStateProvider } from './GlobalStateProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const queryClient = new QueryClient();

render(
  <QueryClientProvider client={queryClient}>
    <ThemeProvider theme={defaultTheme}>
      <BrowserRouter>
        <GlobalStateProvider>
          <GlobalStateContext.Consumer>
            {(globalState) => {
              const { tenantRPC, getThemeName = () => undefined } = globalState as GlobalState;
              return <App />;
            }}
          </GlobalStateContext.Consumer>
        </GlobalStateProvider>
      </BrowserRouter>
    </ThemeProvider>
  </QueryClientProvider>
  ,
  document.getElementById('app') as HTMLElement,
);
