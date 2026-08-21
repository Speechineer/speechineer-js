/**
 * Shared plumbing for the per-capability session factories: forwarding of the dev
 * callbacks through a mutable options holder (so bindings can refresh the closures
 * every render), the core-options fragment every capability passes, and the
 * options-updater every public session exposes.
 *
 * @internal
 */

import { fromSignal } from '../../convert/inbound/common/signal.js';
import { SpeechineerError } from '../../errors.js';
import type { FormValueCallbacks, SessionCallbacks, TranscriptCallbacks } from '../../types/public/common/callbacks.js';
import type { ResolveResponseSdkBase } from '../../types/sdk/workflows/base.js';
import type { WorkflowSessionCoreOptions } from '../base.js';

/**
 * Lets a binding refresh the options a session reads its callbacks from — the
 * framework equivalent of "latest closures".
 *
 * @internal
 */
export interface SessionOptionsUpdater<O> {
  setOptions: (next: O) => void;
}

/** A holder whose `.current` the forwarders read at call time. @internal */
export interface Holder<O> {
  current: O;
}

/** The universal callbacks, forwarded from the holder. @internal */
export function forwardSessionCallbacks<O extends SessionCallbacks>(h: Holder<O>): SessionCallbacks {
  return {
    onSessionStart: (id) => h.current.onSessionStart?.(id),
    onStateChange: (s) => h.current.onStateChange?.(s),
    onEvent: (e) => h.current.onEvent?.(e),
    onError: (e) => h.current.onError?.(e),
  };
}

/** @internal */
export function forwardFormValueCallbacks<O extends FormValueCallbacks>(h: Holder<O>): FormValueCallbacks {
  return { onFieldValue: (fieldId, value) => h.current.onFieldValue?.(fieldId, value) };
}

/** @internal */
export function forwardTranscriptCallbacks<O extends TranscriptCallbacks>(h: Holder<O>): TranscriptCallbacks {
  return { onTranscript: (text) => h.current.onTranscript?.(text) };
}

/**
 * The core-options fragment that maps a capability's dev callbacks (already
 * forwarded) onto the universal session: wire signals → dev events.
 *
 * @internal
 */
export function coreCallbackOptions<C extends ResolveResponseSdkBase>(
  params: SessionCallbacks,
): Pick<WorkflowSessionCoreOptions<C>, 'onSessionStart' | 'onError' | 'onEvent' | 'onStateChange'> {
  return {
    onSessionStart: (id) => params.onSessionStart?.(id),
    onError: (e) => params.onError?.(e),
    onEvent: (s) => params.onEvent?.(fromSignal(s)),
    onStateChange: (s) => params.onStateChange?.(s),
  };
}

/** Rejects when an action runs without a session. @internal */
export function requireSessionId(id: string | null): string {
  if (!id) {
    throw new SpeechineerError('No active session — call start() first.', {
      code: 'NO_SESSION',
      phase: 'action',
      recoverable: true,
    });
  }
  return id;
}
