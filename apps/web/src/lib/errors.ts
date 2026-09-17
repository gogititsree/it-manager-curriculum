/**
 * One way to read a status code off a failed request, whichever client produced it.
 *
 * `ApiError` (HTTP) and `LocalClientError` (static mode) are deliberately separate classes —
 * @itmc/local-client may depend on @itmc/api-client for types only, so it cannot extend or re-export
 * the class. Both carry a numeric `status`, so components branch on that rather than on `instanceof`.
 */
import { ApiError } from '@itmc/api-client';

export function httpStatusOf(error: unknown): number | undefined {
  if (error instanceof ApiError) return error.status;
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}
