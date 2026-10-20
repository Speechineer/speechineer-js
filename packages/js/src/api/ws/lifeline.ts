/**
 * Session-connection WebSocket client.
 *
 * The single bidirectional control channel. Inbound: frames — progress while the session runs,
 * and the one failure that ends it. Outbound: client-sent control frames (e.g. the request to
 * stop recording).
 *
 * A session can end two ways here, and both are handled:
 *
 * - the **frame**, whose `error` half carries the failure with its real code, both sentences and
 *   its typed data;
 * - the **close frame**, `4000 + the failure's category` with `"<type>:<code>"` as the reason,
 *   which is all that is left when the connection was opened after the session had already
 *   ended — nobody was listening for the message. `fromCloseFrame` reads what it can.
 *
 * Both funnel into `onTerminal`, so a caller handles one thing. `4404` keeps its own callback:
 * an id that names nothing is the resume trigger, not a failure to report.
 *
 * Contributor notes (not rendered):
 * - **This layer speaks the wire**, so the callbacks hand over events, not error classes;
 *   `convert/` turns them into classes. The frame shape is `{level, [level]: {…}, meta}` and
 *   `eventOf` is the only sanctioned way to read it — it mirrors the service's own `event_of`,
 *   including the field-matches-level rule, so a frame this client *sends* is read by exactly
 *   the function that validates it.
 * - **Terminality is the level.** `level === 'error'` and nothing else: not an event name, not
 *   the presence of an `error` key. Testing a key is what used to agree with the level by luck.
 */

import type { OnWorkflowNotFoundCallback } from '../../constants.js';
import { fromCloseFrame } from '../../convert/inbound/common/close-frame.js';
import { sdkError } from '../../errors/index.js';
import type { SdkLanguage } from '../../errors/manifest.js';
import { closeCodeFor, type EventSdk, isTerminalCloseCode, type LevelSdk } from '../../types/sdk/common/event.js';
import { eventOf, type FrameMetaSdk, isTerminalLevel } from '../../types/sdk/common/lifeline.js';

/** One non-terminal frame: the level it arrived under and the event it carried. */
export type NoticeCallback = (level: Exclude<LevelSdk, 'error'>, event: EventSdk) => void;
/** The failure that ended the session, in wire shape. */
export type TerminalCallback = (event: EventSdk) => void;
export type LifelineConnectionCallback = () => void;

export interface LifelineClient {
  connect: () => void;
  disconnect: () => void;
  /** Send one client-originated frame to the service. */
  sendFrame: (level: LevelSdk, event: EventSdk) => void;
  wsRef: { current: WebSocket | null };
}

export interface LifelineClientCallbacks {
  /** Every inbound NON-terminal frame — progress, after the service's verbosity filter. */
  onNotice?: NoticeCallback;
  /** The session ended. Fires at most once, from whichever of the two paths arrives first. */
  onTerminal?: TerminalCallback;
  onConnected?: LifelineConnectionCallback;
  onDisconnected?: LifelineConnectionCallback;
  onWorkflowNotFound?: OnWorkflowNotFoundCallback;
  /**
   * Which language the SDK renders its *own* sentences in, for the close-frame fallback.
   *
   * Read at call time: a close can arrive long after `connect()`, and the session may have
   * switched language in between.
   */
  language?: () => SdkLanguage | undefined;
}

export function createLifelineClient(lifelineUrl: string, callbacks: LifelineClientCallbacks): LifelineClient {
  const wsRef: { current: WebSocket | null } = { current: null };
  let disconnectedFired = false;
  // The frame and the close frame describe the SAME ending. Whichever lands first wins and the
  // other is suppressed — one session ending must not be reported twice, and the frame is the
  // better report of the two (it has the sentences and the meta a close frame cannot carry).
  let terminalFired = false;
  let sessionId = '';

  const fireTerminal = (event: EventSdk): void => {
    if (terminalFired) return;
    terminalFired = true;
    callbacks.onTerminal?.(event);
  };

  /** Fire onDisconnected at most once per connect() cycle. */
  const fireDisconnected = (): void => {
    if (disconnectedFired) return;
    disconnectedFired = true;
    callbacks.onDisconnected?.();
  };

  const connect = (): void => {
    if (!lifelineUrl) return;
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    disconnectedFired = false;
    // `new WebSocket()` throws SYNCHRONOUSLY on a URL the browser refuses — malformed, or
    // `ws://` from an `https://` page, which some browsers reject as mixed content rather than
    // merely failing to connect. Unguarded it reached the generic funnel as `UNKNOWN`, while the
    // HTTP path answers `NETWORK` for the very same class of problem (FLY-503). A dependency,
    // not a notification: there is no socket to carry on with, so it becomes a typed failure.
    let ws: WebSocket;
    try {
      ws = new WebSocket(lifelineUrl);
    } catch (e) {
      throw sdkError('NETWORK', {
        meta: { detail: e instanceof Error ? e.message : String(e) },
        language: callbacks.language?.(),
        cause: e,
      });
    }
    wsRef.current = ws;

    ws.addEventListener('open', () => callbacks.onConnected?.());

    ws.addEventListener('close', (event) => {
      if (event.code === closeCodeFor('not_found')) {
        // Not a failure to report: the id names nothing, which is what the resume chain exists
        // to answer.
        callbacks.onWorkflowNotFound?.();
      } else if (isTerminalCloseCode(event.code)) {
        // Normally redundant — the frame already arrived and `fireTerminal` ignores this. It is
        // the ONLY report when the connection was opened after the session had already ended,
        // which is the case that used to reach the client as silence.
        const failure = fromCloseFrame(event.code, event.reason ?? '', callbacks.language?.());
        if (failure) fireTerminal(failure);
      }
      fireDisconnected();
    });

    ws.addEventListener('error', () => fireDisconnected());

    ws.addEventListener('message', (event) => {
      let payload: unknown;
      try {
        payload = JSON.parse(event.data as string);
      } catch {
        return; // not JSON
      }
      const read = eventOf(payload);
      // Not a frame this build understands. Dropped rather than raised, so a newer service can
      // add a shape without breaking an older app — the same rule the service applies to frames
      // it receives from us.
      if (!read) return;
      // Remember the id the service stamps, so a frame we send back carries the same one.
      const meta = (payload as { meta?: FrameMetaSdk }).meta;
      if (meta?.session_id) sessionId = meta.session_id;
      if (isTerminalLevel(read.level)) {
        fireTerminal(read.event);
        return;
      }
      callbacks.onNotice?.(read.level as Exclude<LevelSdk, 'error'>, read.event);
    });
  };

  /**
   * Send one frame, in exactly the shape `event_of` reads.
   *
   * The service's reader answers `None` for anything else and **drops the frame in silence** by
   * design, so a shape mismatch here does not fail loudly — it just means the service never
   * hears the request. That is what made a stop gesture do nothing for a whole release.
   */
  const sendFrame = (level: LevelSdk, event: EventSdk): void => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const meta: FrameMetaSdk = { session_id: sessionId, timestamp: new Date().toISOString() };
    try {
      ws.send(JSON.stringify({ level, [level]: event, meta }));
    } catch {
      // peer gone; the close handler will fire.
    }
  };

  const disconnect = (): void => {
    if (wsRef.current) {
      try {
        wsRef.current.close(1000, 'client closing');
      } catch {
        /* already closed */
      }
      wsRef.current = null;
    }
    fireDisconnected();
  };

  return { connect, disconnect, sendFrame, wsRef };
}
