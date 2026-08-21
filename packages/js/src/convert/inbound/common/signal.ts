/**
 * Inbound signal conversion: the wire snake_case `LifelineSignal` → the dev camelCase
 * `SessionEvent` (before `onEvent`). Runtime failures (`type === 'crash'`) become a
 * `SpeechineerError` in `errors.ts` (`fromCrashSignal`), not an event shape.
 */

import type { SessionEvent } from '../../../types/public/common/event.js';
import type { LifelineSignal } from '../../../types/sdk/common/lifeline.js';

export function fromSignal(s: LifelineSignal): SessionEvent {
  return {
    type: s.type,
    level: s.verbosity,
    source: s.source,
    payload: s.payload,
    sessionId: s.session_id,
    timestamp: s.timestamp,
  };
}
