/**
 * Lifeline signal types — mirrors the Speechineer API's session-signal schema.
 *
 * The single client-facing event envelope: both the signals the service surfaces to
 * the client and the signals the client sends back share this one shape.
 */

/**
 * How much you want to hear about. Each `SignalEvent` carries one of these
 * severities, from `debug` chatter to `critical` failures — filter in your
 * `onSignal` handler for the level of detail your integration needs.
 *
 * @group Signals and errors
 */
export type LogVerbosity = 'debug' | 'info' | 'warning' | 'error' | 'critical';

/**
 * One signal flowing across the lifeline (both directions share this envelope). `type`
 * is the service's snake_case signal name (e.g. 'crash',
 * 'client_disconnected', 'stop_recording_requested').
 */
export interface LifelineSignal {
  type: string;
  verbosity: LogVerbosity;
  source: string;
  payload: Record<string, unknown>;
  session_id: string;
  /** ISO-8601 UTC timestamp of emission. */
  timestamp: string;
}

/** Payload shape for a `type === 'crash'` lifeline signal. */
export interface CrashPayload {
  level: 'workflow' | 'provider' | 'adapter' | 'producer' | 'consumer' | 'inbound' | 'outbound';
  error_code: string;
  message: string;
  detail: string | null;
}

/** Narrow a lifeline signal to a crash (typed payload). */
export function isCrashSignal(sig: LifelineSignal): sig is LifelineSignal & { payload: CrashPayload } {
  return sig.type === 'crash';
}
