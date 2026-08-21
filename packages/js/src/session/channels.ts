/**
 * Connection adapters — wrap the transport clients (`api/ws/*`) and the microphone
 * recorder (`tools/audio`) so that a session reports each connection's status in its
 * state, and records what arrives on it (values, transcript) before forwarding it to
 * the developer's callbacks. One adapter per connection kind; a capability attaches
 * only the connections it uses.
 *
 * @internal
 */

import { createFormDataClient, type FormDataClient } from '../api/ws/form-data.js';
import { createTranscriptionClient, type TranscriptionClient } from '../api/ws/transcription.js';
import { type AudioConfig, type AudioRecorder, createAudioRecorder } from '../tools/audio/recorder.js';
import type { WorkflowSessionCore } from './base.js';

export interface AttachedChannel {
  /** Close the connection (and stop capture, for audio). Idempotent. */
  detach: () => void;
}

export interface ResultsChannelCallbacks {
  onFieldValue?: (fieldId: string, value: unknown) => void;
}

/** The recognized-values connection (wire: form_data). */
export function attachResultsChannel(
  core: WorkflowSessionCore,
  url: string,
  callbacks: ResultsChannelCallbacks,
): AttachedChannel {
  let client: FormDataClient | null = createFormDataClient(url, {
    onFieldUpdate: (fieldId, value) => {
      core.setFieldValue(fieldId, value);
      callbacks.onFieldValue?.(fieldId, value);
    },
    onConnected: () => core.setConnection('results', 'open'),
    onDisconnected: () => core.setConnection('results', 'closed'),
  });
  core.setConnection('results', 'connecting');
  client.connect();
  return {
    detach: () => {
      client?.disconnect();
      client = null;
      core.setConnection('results', 'closed');
    },
  };
}

export interface TranscriptChannelCallbacks {
  onTranscript?: (text: string) => void;
}

/** The spoken-text connection (wire: transcription). */
export function attachTranscriptChannel(
  core: WorkflowSessionCore,
  url: string,
  callbacks: TranscriptChannelCallbacks,
): AttachedChannel {
  let client: TranscriptionClient | null = createTranscriptionClient(url, {
    onTranscriptionUpdate: (text) => {
      core.setTranscript(text);
      callbacks.onTranscript?.(text);
    },
    onConnected: () => core.setConnection('transcript', 'open'),
    onDisconnected: () => core.setConnection('transcript', 'closed'),
  });
  core.setConnection('transcript', 'connecting');
  client.connect();
  return {
    detach: () => {
      client?.disconnect();
      client = null;
      core.setConnection('transcript', 'closed');
    },
  };
}

export interface AttachedAudioChannel extends AttachedChannel {
  /** Stop capturing: reports `closing` until capture has wound down, then `closed`. */
  stop: () => void;
}

/**
 * The microphone connection: opens the mic + the audio connection. `open` while the
 * mic is streaming, `closing` between `stop()` and the moment capture ended.
 * Rejects (and the caller reports `failed`) when the audio config is unusable or the
 * microphone cannot be opened.
 */
export async function attachAudioChannel(
  core: WorkflowSessionCore,
  url: string,
  config: AudioConfig,
): Promise<AttachedAudioChannel> {
  let recorder: AudioRecorder | null = null;
  recorder = createAudioRecorder(
    url,
    {
      onRecordingStateChange: (isRecording) => core.setConnection('audio', isRecording ? 'open' : 'closed'),
    },
    config,
  );
  core.setConnection('audio', 'connecting');
  const stop = (): void => {
    if (!recorder) return;
    if (core.getState().connections.audio?.status === 'open') core.setConnection('audio', 'closing');
    recorder.stop();
    recorder = null;
  };
  await recorder.start();
  return {
    stop,
    detach: () => {
      stop();
      core.setConnection('audio', 'closed');
    },
  };
}
