/**
 * Audio WebSocket client.
 *
 * The outbound audio data plane, mirroring the service's `audio` socket kind
 * (one socket per kind). It is a PURE transport: it owns
 * only the socket — open/close, raw PCM frames, and the one-time `format`
 * handshake. Microphone capture (getUserMedia + AudioWorklet) lives in
 * `../../tools/audio/recorder.ts`, which drives this client.
 *
 * Like the form-data plane, a drop here is quiet: client-disconnect,
 * workflow-not-found (4404) and crashes (4501-4505) are detected on the
 * lifeline WebSocket alone, never here.
 */

export type AudioConnectionCallback = () => void;

/** The PCM stream descriptor sent once, right after the socket opens. */
export interface PcmFormat {
  sampleRate: number;
  channels: number;
  sampleFormat: string;
  bitDepth: number;
}

export interface AudioClient {
  connect: () => void;
  disconnect: () => void;
  /** Send one raw PCM frame (little-endian s16). No-op unless the socket is OPEN. */
  sendFrame: (frame: ArrayBuffer) => void;
  /** Send the one-time `{ control: 'format', pcm }` handshake. No-op unless OPEN. */
  sendFormat: (pcm: PcmFormat) => void;
  wsRef: { current: WebSocket | null };
}

export interface AudioClientCallbacks {
  /** Fired once when the audio WebSocket opens. */
  onConnected?: AudioConnectionCallback;
  /** Fired at most once when the audio WebSocket closes, errors, or is disconnected. */
  onDisconnected?: AudioConnectionCallback;
}

export function createAudioClient(audioUrl: string, callbacks: AudioClientCallbacks): AudioClient {
  const wsRef: { current: WebSocket | null } = { current: null };
  let disconnectedFired = false;

  /** Fire onDisconnected at most once per connect() cycle. */
  const fireDisconnected = (): void => {
    if (disconnectedFired) return;
    disconnectedFired = true;
    callbacks.onDisconnected?.();
  };

  const connect = (): void => {
    if (!audioUrl) return;
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    disconnectedFired = false;
    const ws = new WebSocket(audioUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.addEventListener('open', () => callbacks.onConnected?.());
    ws.addEventListener('close', () => fireDisconnected());
    ws.addEventListener('error', () => fireDisconnected());
    // Inbound messages are not part of the audio protocol; nothing to read.
  };

  const sendFrame = (frame: ArrayBuffer): void => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(frame);
    } catch {
      // peer gone; the close handler will fire.
    }
  };

  const sendFormat = (pcm: PcmFormat): void => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify({ control: 'format', pcm }));
    } catch {
      // peer gone; the close handler will fire.
    }
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

  return { connect, disconnect, sendFrame, sendFormat, wsRef };
}
