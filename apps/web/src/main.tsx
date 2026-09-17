import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './index.css';
import { httpStatusOf } from './lib/errors';
import { initTheme } from './lib/theme';

initTheme();

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // A 401, a 404 or a not-yet-implemented 501 will not become a 200 on the third try. Retrying
      // them only delays the error state the page already knows how to show.
      retry: (failureCount, error) => {
        const status = httpStatusOf(error);
        return status !== undefined && [400, 401, 404, 501].includes(status) ? false : failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

/**
 * GitHub Pages serves the app from /<repo>/, not from /. Vite rewrites asset URLs for that via
 * `base`, but the router has to be told separately or every in-app link resolves to the wrong path
 * and every deep link 404s. BASE_URL is '/' for the server build, which makes this a no-op there.
 */
const basename = import.meta.env.BASE_URL.replace(/\/+$/, '');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
