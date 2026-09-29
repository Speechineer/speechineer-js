/**
 * Inbound failure conversion: the wire `Problem` → the error a developer catches.
 *
 * `Problem.type` is the string that picks the constructor — the wire carries no classes. The
 * same object arrives on both paths (an HTTP failure envelope's `error`, a terminal session
 * signal's `error`), so both end up here and a caller handles one thing either way.
 */

import { SpeechineerError } from '../../../errors/base.js';
import {
  SpeechineerAccessError,
  SpeechineerAuthError,
  SpeechineerClientError,
  SpeechineerConflictError,
  SpeechineerNotFoundError,
  SpeechineerQuotaError,
  SpeechineerRateLimitError,
  SpeechineerRuntimeError,
  SpeechineerServiceError,
  SpeechineerSessionEndedError,
  SpeechineerTimeoutError,
  SpeechineerUnavailableError,
  SpeechineerUpstreamError,
  SpeechineerValidationError,
} from '../../../errors/categories.js';
import type { ProblemSdk } from '../../../types/sdk/common/problem.js';

/** Every category, mapped to the class that represents it. */
const BY_TYPE: Record<string, typeof SpeechineerError> = {
  client: SpeechineerClientError,
  auth: SpeechineerAuthError,
  quota: SpeechineerQuotaError,
  access: SpeechineerAccessError,
  not_found: SpeechineerNotFoundError,
  gone: SpeechineerSessionEndedError,
  conflict: SpeechineerConflictError,
  validation: SpeechineerValidationError,
  rate_limit: SpeechineerRateLimitError,
  runtime: SpeechineerRuntimeError,
  service: SpeechineerServiceError,
  upstream: SpeechineerUpstreamError,
  unavailable: SpeechineerUnavailableError,
  timeout: SpeechineerTimeoutError,
};

/**
 * Build the error a failure projects into, carrying everything across unchanged.
 *
 * A category this build has never heard of falls back to the base class rather than throwing:
 * a newer service must never be able to break an older app's error handling.
 */
export function fromProblem(
  problem: ProblemSdk,
  options: { requestId?: string | null; cause?: unknown } = {},
): SpeechineerError {
  const Ctor = BY_TYPE[problem.type ?? ''] ?? SpeechineerError;
  return new Ctor({
    type: problem.type ?? 'service',
    code: problem.code,
    message: problem.message,
    field: problem.field ?? null,
    meta: problem.meta ?? null,
    details: problem.details ?? [],
    requestId: options.requestId ?? null,
    cause: options.cause,
  });
}
