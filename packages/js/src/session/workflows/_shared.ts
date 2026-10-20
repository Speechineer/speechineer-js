/**
 * Shared plumbing for the per-capability session factories: forwarding of the dev
 * callbacks through a mutable options holder (so bindings can refresh the closures
 * every render), the core-options fragment every capability passes, and the
 * options-updater every public session exposes.
 *
 * @internal
 */

import { sdkError } from '../../errors/index.js';
import type { FormValueCallbacks, SessionCallbacks, TranscriptCallbacks } from '../../types/public/common/callbacks.js';
import type { ResolveResponseSdkBase } from '../../types/sdk/workflows/base.js';
import type { WorkflowSessionCoreOptions } from '../base.js';
import { safely } from '../safely.js';

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

/**
 * The universal callbacks, forwarded from the holder.
 *
 * **Every forward is guarded** (`safely`), and guarded *individually* rather than around the
 * group: these are the app's own functions running inside our control flow, and one of them
 * throwing must not stop the next. That granularity is the point — `coreCallbackOptions` below
 * sends one report to both its level's hook and `onEvent`, so a throwing `onError` would
 * otherwise swallow the `onEvent` that was meant to follow it. See `safely` for the three ways
 * this bit before it was guarded.
 *
 * @internal
 */
export function forwardSessionCallbacks<O extends SessionCallbacks>(h: Holder<O>): SessionCallbacks {
  return {
    onSessionStart: (id) => safely(() => h.current.onSessionStart?.(id)),
    onStateChange: (s) => safely(() => h.current.onStateChange?.(s)),
    onEvent: (e) => safely(() => h.current.onEvent?.(e)),
    onError: (e) => safely(() => h.current.onError?.(e)),
    onWarning: (n) => safely(() => h.current.onWarning?.(n)),
    onInfo: (n) => safely(() => h.current.onInfo?.(n)),
    onDebug: (n) => safely(() => h.current.onDebug?.(n)),
  };
}

/** @internal */
export function forwardFormValueCallbacks<O extends FormValueCallbacks>(h: Holder<O>): FormValueCallbacks {
  return { onFieldValue: (fieldId, value) => safely(() => h.current.onFieldValue?.(fieldId, value)) };
}

/** @internal */
export function forwardTranscriptCallbacks<O extends TranscriptCallbacks>(h: Holder<O>): TranscriptCallbacks {
  return { onTranscript: (text) => safely(() => h.current.onTranscript?.(text)) };
}

/**
 * The core-options fragment that maps a capability's dev callbacks (already forwarded) onto the
 * universal session.
 *
 * **`onEvent` receives everything, failures included** — that is the whole reason an error and a
 * notice share one interface. So each report goes to its own level's hook *and* to `onEvent`,
 * and a caller who wants one stream takes `onEvent` while a caller who wants one level takes the
 * matching hook. Neither has to filter the other out.
 *
 * @internal
 */
export function coreCallbackOptions<C extends ResolveResponseSdkBase>(
  params: SessionCallbacks,
): Pick<WorkflowSessionCoreOptions<C>, 'onSessionStart' | 'onError' | 'onNotice' | 'onStateChange'> {
  // Guarded here as well as in the forwarders above, because this takes a `SessionCallbacks` and
  // a caller may hand it the app's functions directly rather than a forwarded set. Double
  // guarding costs nothing: the inner one catches, so the outer never sees a throw.
  return {
    onSessionStart: (id) => safely(() => params.onSessionStart?.(id)),
    onError: (e) => {
      safely(() => params.onError?.(e));
      safely(() => params.onEvent?.(e));
    },
    onNotice: (notice) => {
      if (notice.level === 'warning') safely(() => params.onWarning?.(notice));
      else if (notice.level === 'info') safely(() => params.onInfo?.(notice));
      else safely(() => params.onDebug?.(notice));
      safely(() => params.onEvent?.(notice));
    },
    onStateChange: (s) => safely(() => params.onStateChange?.(s)),
  };
}

/** Rejects when an action runs without a session. @internal */
export function requireSessionId(id: string | null): string {
  if (!id) {
    throw sdkError('NO_SESSION');
  }
  return id;
}
