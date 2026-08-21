/**
 * The one error type a developer observes: `SpeechineerError`, carrying a stable `code`,
 * the `phase` it happened in, and whether a new `start()` may succeed. Everything the SDK
 * throws or reports through `onError` / `state.error` is converted here — request failures,
 * microphone problems, and the service's own runtime failures alike.
 */

import { RequestError, WorkflowNotFoundError } from './api/workflows/_post.js';
import type { CrashPayload, LifelineSignal } from './types/sdk/common/lifeline.js';

/**
 * When an error happened.
 *
 * - `start` — while creating the session, opening its connections, or starting the microphone.
 * - `recover` — while re-establishing a session the service had dropped.
 * - `connection` — a connection failed while the session was running.
 * - `action` — a request you made (for example `extract`) was rejected.
 * - `end` — while finishing the session.
 * - `runtime` — the service stopped the session; it cannot continue and `recoverable` is `false`.
 *
 * @group Events and errors
 */
export type ErrorPhase = 'start' | 'recover' | 'connection' | 'action' | 'end' | 'runtime';

/** @internal */
export interface SpeechineerErrorOptions {
  code: string;
  phase: ErrorPhase;
  recoverable: boolean;
  cause?: unknown;
  detail?: string | null;
}

/**
 * Something the SDK could not do. Branch on `code` — it is stable — and read `message`
 * for a human-readable explanation. `recoverable` tells you whether calling `start()`
 * again is worth a try (for example after a denied microphone permission, or a network
 * hiccup); when it is `false` the session has stopped for good and you should offer the
 * user a fresh start.
 *
 * Codes you can expect: `AUTH_REQUIRED`, `ACCOUNT_REQUIRED` (client configuration),
 * `NETWORK`, `REQUEST_FAILED` or a specific code returned by Speechineer (the request was
 * rejected), `NOT_FOUND` (the session no longer exists), `MICROPHONE_DENIED`,
 * `MICROPHONE_UNAVAILABLE`, `AUDIO_UNSUPPORTED`, `NO_SESSION` (an action before `start`),
 * `NO_CLIENT` (framework wiring missing), and the runtime failure codes Speechineer reports
 * while a session runs.
 *
 * @group Events and errors
 */
export class SpeechineerError extends Error {
  /** A stable identifier for what went wrong — branch on this, not on `message`. */
  readonly code: string;
  /** When it happened — see {@link ErrorPhase}. */
  readonly phase: ErrorPhase;
  /** Whether a new `start()` may succeed. `false` means the session has stopped for good. */
  readonly recoverable: boolean;
  /** Additional detail from Speechineer, when there is any. */
  readonly detail: string | null;
  /** The underlying error, when there was one. */
  readonly cause?: unknown;

  constructor(message: string, options: SpeechineerErrorOptions) {
    super(message);
    this.name = 'SpeechineerError';
    this.code = options.code;
    this.phase = options.phase;
    this.recoverable = options.recoverable;
    this.detail = options.detail ?? null;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

/** Browser `getUserMedia` rejection names that mean "no permission". */
const DENIED_NAMES = new Set(['NotAllowedError', 'SecurityError', 'PermissionDeniedError']);
/** Browser `getUserMedia` rejection names that mean "no usable device". */
const UNAVAILABLE_NAMES = new Set(['NotFoundError', 'NotReadableError', 'OverconstrainedError', 'AbortError']);

/**
 * Convert anything thrown on the SDK's paths into a `SpeechineerError` for the given phase.
 * Already-converted errors pass through unchanged.
 *
 * @internal
 */
export function toSpeechineerError(e: unknown, phase: ErrorPhase): SpeechineerError {
  if (e instanceof SpeechineerError) return e;
  const recoverable = phase !== 'runtime';
  if (e instanceof WorkflowNotFoundError) {
    return new SpeechineerError(e.message, { code: 'NOT_FOUND', phase, recoverable, cause: e });
  }
  if (e instanceof RequestError) {
    return new SpeechineerError(e.message, { code: e.code ?? 'REQUEST_FAILED', phase, recoverable, cause: e });
  }
  if (e instanceof Error) {
    if (DENIED_NAMES.has(e.name)) {
      return new SpeechineerError('Microphone access was denied.', {
        code: 'MICROPHONE_DENIED',
        phase,
        recoverable,
        cause: e,
      });
    }
    if (UNAVAILABLE_NAMES.has(e.name)) {
      return new SpeechineerError('No usable microphone was found.', {
        code: 'MICROPHONE_UNAVAILABLE',
        phase,
        recoverable,
        cause: e,
      });
    }
    if (e.message.startsWith('Audio config required')) {
      return new SpeechineerError(e.message, { code: 'AUDIO_UNSUPPORTED', phase, recoverable, cause: e });
    }
    return new SpeechineerError(e.message, { code: 'UNKNOWN', phase, recoverable, cause: e });
  }
  return new SpeechineerError(String(e), { code: 'UNKNOWN', phase, recoverable, cause: e });
}

/**
 * The service stopped the session: the typed runtime failure delivered on the session
 * connection becomes a non-recoverable `SpeechineerError` whose `code` is the service's
 * error code.
 *
 * @internal
 */
export function fromCrashSignal(signal: LifelineSignal & { payload: CrashPayload }): SpeechineerError {
  const { message, detail, error_code } = signal.payload;
  return new SpeechineerError(detail ? `${message}: ${detail}` : message, {
    code: error_code,
    phase: 'runtime',
    recoverable: false,
    detail,
  });
}
