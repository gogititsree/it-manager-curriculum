import { createApiClient } from '@itmc/api-client';

/** Token lives in localStorage for the self-hosted single-user case; the settings page sets it. */
export const api = createApiClient({
  baseUrl: '',
  getToken: () => localStorage.getItem('itmc.token') ?? undefined,
});
