import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

import { render } from 'preact';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material';
import { App } from './app';
import defaultTheme from './theme';

render(
  <ThemeProvider theme={defaultTheme}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ThemeProvider>,
  document.getElementById('app') as HTMLElement,
);
