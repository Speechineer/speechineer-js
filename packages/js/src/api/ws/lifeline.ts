/**
 * Session-connection WebSocket client.
 *
 * The single bidirectional control channel. Inbound: signal envelopes — progress while the
 * session runs, and the one failure that ends it. Outbound: client-sent control signals
 * (e.g. `stop_recording_requested`).
 *
 * A session can end two ways here, and both are handled:
 *
 * - the **message**, whose `error` half carries the failure with its real code and data;
 * - the **close frame**, `4000 + the failure's category`, which is all that is left when the
 *   connection was opened after the session had already ended — nobody was listening for the
 *   message. `fromCloseFrame` reconstructs what it can.
 *
 * Both funnel into `onTerminal`, so a caller handles one thing. `4404` keeps its own
 * callback: an id that names nothing is the resume trigger, not a failure to report.
 */

import type { OnWorkflowNotFoundCallback } from '../../constants.js';
import { fromCloseFrame } from '../../convert/inbound/common/close-frame.js';
import { fromProblem } from '../../convert/inbound/common/problem.js';
import type { SpeechineerError } from '../../errors/base.js';
import { isTerminalSignal, type LifelineSignal } from '../../types/sdk/common/lifeline.js';
import { closeCodeFor, isTerminalCloseCode } from '../../types/sdk/common/problem.js';

export type SignalCallback = (signal: LifelineSignal) => void;
export type TerminalCallback = (error: SpeechineerError) => void;
export type LifelineConnectionCallback = () => void;

export interface LifelineClient {
  connect: () => void;
  disconnect: () => void;
  /** Send a client-originated signal envelope to the service. */
  sendSignal: (signal: Partial<LifelineSignal> & { event: string }) => void;
  wsRef: { current: WebSocket | null };
}

export interface LifelineClientCallbacks {
  /** Every inbound NON-terminal signal — progress, after the service's verbosity filter. */
  onSignal?: SignalCallback;
  /** The session ended. Fires at most once, from whichever of the two paths arrives first. */
  onTerminal?: TerminalCallback;
  onConnected?: LifelineConnectionCallback;
  onDisconnected?: LifelineConnectionCallback;
  onWorkflowNotFound?: OnWorkflowNotFoundCallback;
}

export function createLifelineClient(lifelineUrl: string, callbacks: LifelineClientCallbacks): LifelineClient {
  const wsRef: { current: WebSocket | null } = { current: null };
  let disconnectedFired = false;
  // The message and the close frame describe the SAME ending. Whichever lands first wins and
  // the other is suppressed — one session ending must not be reported twice.
  let terminalFired = false;

  const fireTerminal = (error: SpeechineerError): void => {
    if (terminalFired) return;
    terminalFired = true;
    callbacks.onTerminal?.(error);
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
    const ws = new WebSocket(lifelineUrl);
    wsRef.current = ws;

    ws.addEventListener('open', () => callbacks.onConnected?.());

    ws.addEventListener('close', (event) => {
      if (event.code === closeCodeFor('not_found')) {
        // Not a failure to report: the id names nothing, which is what the resume chain
        // exists to answer.
        callbacks.onWorkflowNotFound?.();
      } else if (isTerminalCloseCode(event.code)) {
        // Normally redundant — the message already arrived and `fireTerminal` ignores this.
        // It is the ONLY report when the connection was opened after the session had already
        // ended, which is the case that used to reach the client as silence.
        const problem = fromCloseFrame(event.code, event.reason ?? '');
        if (problem) fireTerminal(fromProblem(problem));
      }
      fireDisconnected();
    });

    ws.addEventListener('error', () => fireDisconnected());

    ws.addEventListener('message', (event) => {
      let sig: LifelineSignal;
      try {
        sig = JSON.parse(event.data) as LifelineSignal;
      } catch {
        return; // ignore non-JSON
      }
      if (!sig || typeof sig !== 'object' || typeof sig.event !== 'string') {
        return;
      }
      // Ask the envelope, not the event name. `crash` and `quota_exceeded` are both endings,
      // and testing `event === 'crash'` is what used to let a spent allowance reach the app
      // as an informational event — the one failure a caller most needs to act on.
      if (isTerminalSignal(sig)) {
        fireTerminal(fromProblem(sig.error));
        return;
      }
      callbacks.onSignal?.(sig);
    });
  };

  const sendSignal = (signal: Partial<LifelineSignal> & { event: string }): void => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const envelope: LifelineSignal = {
      event: signal.event,
      verbosity: signal.verbosity ?? 'info',
      source: signal.source ?? 'client',
      data: signal.data ?? {},
      session_id: signal.session_id ?? '',
      timestamp: signal.timestamp ?? new Date().toISOString(),
    };
    try {
      ws.send(JSON.stringify(envelope));
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

  return { connect, disconnect, sendSignal, wsRef };
}
