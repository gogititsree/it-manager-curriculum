/**
 * The error this client throws, shaped like `ApiError` from @itmc/api-client (same `status`,
 * `message`, `body`) so callers that branch on an HTTP status keep working unchanged.
 *
 * It is a separate class rather than a re-export because ARCHITECTURE.md §3 allows this package to
 * depend on @itmc/api-client for TYPES ONLY. apps/web therefore reads the status through
 * `lib/errors.ts` rather than with `instanceof ApiError`.
 */
export class LocalClientError extends Error {
  readonly name = 'LocalClientError';

  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string): LocalClientError => new LocalClientError(404, `${what} not found`, { error: `${what} not found` });
