import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@itmc/api-client';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './index.css';
import { initTheme } from './lib/theme';

initTheme();

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // A 401, a 404 or a not-yet-implemented 501 will not become a 200 on the third try. Retrying
      // them only delays the error state the page already knows how to show.
      retry: (failureCount, error) =>
        error instanceof ApiError && [400, 401, 404, 501].includes(error.status) ? false : failureCount < 2,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
