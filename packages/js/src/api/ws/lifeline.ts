/**
 * Lifeline WebSocket client.
 *
 * The single bidirectional control channel, mirroring the service's
 * lifeline. Inbound: typed `LifelineSignal` envelopes (errors, debug
 * signals of interest). Outbound: client-sent control signals (e.g.
 * `stop_recording_requested`). This is also the sole place the client
 * learns the workflow crashed (a `crash` signal arrives, then the WS
 * closes with 4501-4505) or vanished (close code 4404).
 */

import { type OnWorkflowNotFoundCallback, WORKFLOW_NOT_FOUND_CLOSE_CODE } from '../../constants.js';
import { type CrashPayload, isCrashSignal, type LifelineSignal } from '../../types/sdk/common/lifeline.js';

export type SignalCallback = (signal: LifelineSignal) => void;
export type CrashCallback = (crash: LifelineSignal & { payload: CrashPayload }) => void;
export type LifelineConnectionCallback = () => void;

export interface LifelineClient {
  connect: () => void;
  disconnect: () => void;
  /** Send a client-originated signal envelope to the service. */
  sendSignal: (signal: Partial<LifelineSignal> & { type: string }) => void;
  wsRef: { current: WebSocket | null };
}

export interface LifelineClientCallbacks {
  /** Every inbound lifeline signal, after verbosity filtering server-side. */
  onSignal?: SignalCallback;
  /** Convenience: only `type === 'crash'` signals, with a typed payload. */
  onCrash?: CrashCallback;
  onConnected?: LifelineConnectionCallback;
  onDisconnected?: LifelineConnectionCallback;
  onWorkflowNotFound?: OnWorkflowNotFoundCallback;
}

export function createLifelineClient(lifelineUrl: string, callbacks: LifelineClientCallbacks): LifelineClient {
  const wsRef: { current: WebSocket | null } = { current: null };
  let disconnectedFired = false;

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
      if (event.code === WORKFLOW_NOT_FOUND_CLOSE_CODE) {
        callbacks.onWorkflowNotFound?.();
      }
      // Crash close codes (4501-4505) need no special handling: the
      // typed `crash` signal already arrived as a message before this
      // close, so consumers reacted via onSignal / onCrash.
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
      if (!sig || typeof sig !== 'object' || typeof sig.type !== 'string') {
        return;
      }
      callbacks.onSignal?.(sig);
      if (isCrashSignal(sig)) callbacks.onCrash?.(sig);
    });
  };

  const sendSignal = (signal: Partial<LifelineSignal> & { type: string }): void => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const envelope: LifelineSignal = {
      type: signal.type,
      verbosity: signal.verbosity ?? 'info',
      source: signal.source ?? 'client',
      payload: signal.payload ?? {},
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
