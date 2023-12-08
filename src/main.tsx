import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {render} from 'preact';
import {BrowserRouter} from 'react-router-dom';
import {App} from './app';
import './index.css';

const queryClient = new QueryClient();

render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <App/>
    </BrowserRouter>
  </QueryClientProvider>,
  document.getElementById('app') as HTMLElement,
);
