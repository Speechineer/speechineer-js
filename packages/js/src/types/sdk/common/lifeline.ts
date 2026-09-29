/**
 * Session-signal types — mirrors the Speechineer API's signal schema.
 *
 * The single client-facing envelope: both the signals the service surfaces and the ones the
 * client sends back share this one shape.
 *
 * `error` **xor** `data`, and which half is filled answers one question: **is the session
 * over?** An `error` means it is — that is the whole meaning of the field, so there is no
 * flag, severity or phase left to interpret. Anything that failed without ending the session
 * reports progress in `data` and has a channel of its own (the close frame of the connection
 * it refused, or the status of the request it answered).
 */

import type { ProblemSdk } from './problem.js';

/**
 * How much you want to hear about. Each signal carries one of these severities, from `debug`
 * chatter to `critical` failures.
 */
export type LogVerbosity = 'debug' | 'info' | 'warning' | 'error' | 'critical';

/**
 * One signal flowing across the session connection (both directions share this envelope).
 *
 * `event` is the service's snake_case signal name (e.g. `'crash'`, `'quota_exceeded'`,
 * `'stop_recording_requested'`) — it says *what happened*. Whether the session is *over* is a
 * separate question, answered by `error`.
 */
export interface LifelineSignal {
  event: string;
  verbosity: LogVerbosity;
  source: string;
  /** The failure that ended the session. Present **iff** the session is over. */
  error?: ProblemSdk | null;
  /** What happened, while the session is still running. Absent on a terminal signal. */
  data?: Record<string, unknown> | null;
  session_id: string;
  /** ISO-8601 UTC timestamp of emission. */
  timestamp: string;
}

/**
 * Narrow a signal to a terminal one — the session is over and `error` is present.
 *
 * Asks the envelope, not the event name: `crash` and `quota_exceeded` are both terminal, and
 * a future terminal event would be too. Testing `event === 'crash'` — what this SDK used to
 * do — silently missed a spent budget, which is exactly the session-ending failure a caller
 * most needs to act on.
 */
export function isTerminalSignal(
  sig: LifelineSignal,
): sig is LifelineSignal & { error: ProblemSdk } {
  return sig.error != null;
}
