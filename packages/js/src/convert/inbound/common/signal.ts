/**
 * Inbound signal conversion: the wire snake_case `LifelineSignal` → the dev camelCase
 * `SessionEvent` (before `onEvent`).
 *
 * Only NON-terminal signals come through here. A terminal one carries the failure in its
 * `error` half and becomes a `SpeechineerError` via `fromProblem` instead — see
 * `api/ws/lifeline.ts`, which asks the envelope which it is.
 */

import type { SessionEvent } from '../../../types/public/common/event.js';
import type { LifelineSignal } from '../../../types/sdk/common/lifeline.js';

export function fromSignal(s: LifelineSignal): SessionEvent {
  return {
    event: s.event,
    level: s.verbosity,
    source: s.source,
    data: s.data ?? {},
    sessionId: s.session_id,
    timestamp: s.timestamp,
  };
}
