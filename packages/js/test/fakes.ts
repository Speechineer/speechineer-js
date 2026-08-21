/**
 * Deterministic fakes for the session tests: a scriptable `WebSocket` installed on
 * `globalThis`, and a fake microphone recorder (the real one needs getUserMedia).
 * No timers, no randomness — every transition is driven explicitly by the test.
 */

import { vi } from 'vitest';

export class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  private listeners: Record<string, Array<(event: unknown) => void>> = {};

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, cb: (event: unknown) => void): void {
    (this.listeners[type] ??= []).push(cb);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code = 1000): void {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close', { code });
  }

  // --- test controls ---
  /** The server accepted the connection. */
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open', {});
  }
  /** The server (or network) closed it with a code. */
  serverClose(code: number): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close', { code });
  }
  message(data: unknown): void {
    this.emit('message', { data: JSON.stringify(data) });
  }
  private emit(type: string, event: unknown): void {
    for (const cb of this.listeners[type] ?? []) cb(event);
  }

  static byUrl(fragment: string): FakeWebSocket {
    const found = FakeWebSocket.instances.filter((ws) => ws.url.includes(fragment));
    const last = found[found.length - 1];
    if (!last) throw new Error(`no fake socket for ${fragment}`);
    return last;
  }
  static reset(): void {
    FakeWebSocket.instances = [];
  }
}

export function installFakeWebSocket(): void {
  FakeWebSocket.reset();
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
}

/** A fake recorder: `start()` reports recording immediately, `stop()` reports it ended. */
export interface FakeRecorderHandle {
  started: number;
  stopped: number;
  /** Simulate the socket/mic winding down after stop (the real one is async). */
  finishStop: () => void;
  /** When set, the next `start()` rejects with it (a denied microphone, …) and clears it. */
  failNextStart: Error | null;
}

export function installFakeRecorder(): FakeRecorderHandle {
  const handle: FakeRecorderHandle = { started: 0, stopped: 0, finishStop: () => {}, failNextStart: null };
  vi.doMock('../src/tools/audio/recorder.js', () => ({
    createAudioRecorder: (
      _url: string,
      callbacks: { onRecordingStateChange: (r: boolean) => void; onConnected?: () => void; onDisconnected?: () => void },
      config: { sampleRate: number; frameDurationMs: number },
    ) => {
      if (typeof config.sampleRate !== 'number' || Number.isNaN(config.sampleRate)) {
        throw new Error('Audio config required');
      }
      let recording = false;
      return {
        start: async () => {
          handle.started += 1;
          if (handle.failNextStart) {
            const e = handle.failNextStart;
            handle.failNextStart = null;
            throw e;
          }
          recording = true;
          callbacks.onConnected?.();
          callbacks.onRecordingStateChange(true);
        },
        stop: () => {
          handle.stopped += 1;
          handle.finishStop = () => {
            if (!recording) return;
            recording = false;
            callbacks.onRecordingStateChange(false);
            callbacks.onDisconnected?.();
          };
        },
      };
    },
  }));
  return handle;
}

export function answer(id = 'sess-1') {
  return {
    session_id: id,
    connection: {
      lifeline_ws_url: `ws://x/lifeline/${id}`,
      audio_ws_url: `ws://x/audio/${id}`,
      form_data_ws_url: `ws://x/form_data/${id}`,
      transcription_ws_url: `ws://x/transcription/${id}`,
      audio_sample_rate: 16000,
      audio_frame_duration_ms: 20,
    },
    quota: {},
  };
}

/** Let queued microtasks (awaits inside start/recover) settle. */
export const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

/** Decode a compact JWT's header + payload (base64url, UTF-8, no verification). */
export function decodeJwt(token: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
} {
  const [header, payload] = token.split('.');
  const fromB64Url = (segment: string): Record<string, unknown> => {
    const binary = atob(segment.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  };
  return { header: fromB64Url(header), payload: fromB64Url(payload) };
}
