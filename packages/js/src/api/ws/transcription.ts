/**
 * Transcription WebSocket client.
 *
 * The streamed transcript data plane, mirroring the service's `transcription` socket kind
 * (one socket per kind). Only `speech_to_form_with_transcription`
 * opens one. Each inbound message is a `TranscriptionSnapshot` (`{ text: string }`) —
 * the accumulated full transcript — surfaced verbatim via `onTranscriptionUpdate`.
 *
 * It maps no close codes: client-disconnect, workflow-not-found (4404) and
 * a session that ended is detected on the session connection (its `4xxx` close carries the
 * category, and the message before it carries the failure itself).
 */

import { sdkError } from '../../errors/index.js';
import type { TranscriptionSnapshot } from '../../types/sdk/common/transcription-snapshot.js';

export type TranscriptionUpdateCallback = (text: string) => void;
export type TranscriptionConnectionCallback = () => void;

export interface TranscriptionClient {
  connect: () => void;
  disconnect: () => void;
  wsRef: { current: WebSocket | null };
}

export interface TranscriptionClientCallbacks {
  /** Fired once per streamed snapshot with the accumulated full transcript text. */
  onTranscriptionUpdate: TranscriptionUpdateCallback;
  /** Fired once when the transcription WebSocket opens. */
  onConnected?: TranscriptionConnectionCallback;
  /** Fired at most once when the transcription WebSocket closes, errors, or is disconnected. */
  onDisconnected?: TranscriptionConnectionCallback;
}

export function createTranscriptionClient(
  transcriptionUrl: string,
  callbacks: TranscriptionClientCallbacks,
): TranscriptionClient {
  const wsRef: { current: WebSocket | null } = { current: null };
  let disconnectedFired = false;

  /** Fire onDisconnected at most once per connect() cycle. */
  const fireDisconnected = (): void => {
    if (disconnectedFired) return;
    disconnectedFired = true;
    callbacks.onDisconnected?.();
  };

  const connect = (): void => {
    if (!transcriptionUrl) return;
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
      ws = new WebSocket(transcriptionUrl);
    } catch (e) {
      throw sdkError('NETWORK', {
        meta: { detail: e instanceof Error ? e.message : String(e) },
        cause: e,
      });
    }
    wsRef.current = ws;

    ws.addEventListener('open', () => callbacks.onConnected?.());
    ws.addEventListener('close', () => fireDisconnected());
    ws.addEventListener('error', () => fireDisconnected());

    ws.addEventListener('message', (event) => {
      let snapshot: TranscriptionSnapshot;
      try {
        snapshot = JSON.parse(event.data) as TranscriptionSnapshot;
      } catch {
        return; // ignore non-JSON
      }
      if (snapshot && typeof snapshot.text === 'string') {
        callbacks.onTranscriptionUpdate(snapshot.text);
      }
    });
  };

  const disconnect = (): void => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      try {
        ws.close(1000, 'client closing');
      } catch {
        /* already closed */
      }
    }
    fireDisconnected();
  };

  return { connect, disconnect, wsRef };
}
