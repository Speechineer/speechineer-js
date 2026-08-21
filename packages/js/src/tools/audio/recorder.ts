/**
 * Audio recorder: microphone capture (getUserMedia + AudioWorklet) driving the
 * audio-plane WebSocket transport (`createAudioClient`). This module owns the
 * mic and the PCM worklet; the socket itself lives in `../../api/ws/audio.ts`,
 * mirroring the service's one-socket-per-kind split (audio / results / lifeline).
 */

import { type AudioConnectionCallback, createAudioClient } from '../../api/ws/audio.js';
import { getWorkletBlobUrl } from './worklet.js';

export type RecordingStateChangeCallback = (isRecording: boolean) => void;

export interface AudioConfig {
  sampleRate: number;
  frameDurationMs: number;
}

export interface AudioRecorderCallbacks {
  /** Fired with `true` when the mic starts streaming, `false` when it stops. */
  onRecordingStateChange: RecordingStateChangeCallback;
  /** Fired when the audio WebSocket transport opens. */
  onConnected?: AudioConnectionCallback;
  /** Fired at most once when the audio WebSocket closes or errors. */
  onDisconnected?: AudioConnectionCallback;
}

export interface AudioRecorder {
  start: () => Promise<void>;
  stop: () => void;
}

export function createAudioRecorder(
  audioWsUrl: string,
  callbacks: AudioRecorderCallbacks,
  audioConfig: AudioConfig,
): AudioRecorder {
  if (
    typeof audioConfig.sampleRate !== 'number' ||
    typeof audioConfig.frameDurationMs !== 'number' ||
    Number.isNaN(audioConfig.sampleRate) ||
    Number.isNaN(audioConfig.frameDurationMs)
  ) {
    throw new Error(
      'Audio config required: the session answer must carry audio_sample_rate and audio_frame_duration_ms',
    );
  }
  const config: AudioConfig = audioConfig;
  let isRecording = false;
  let formatSent = false;
  let stream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let processor: AudioWorkletNode | null = null;

  const _stopStream = (): void => {
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
  };

  const _cleanupAudio = (): void => {
    if (processor) {
      try {
        processor.disconnect();
      } catch {}
      processor = null;
    }
    if (audioContext) {
      try {
        audioContext.close();
      } catch {}
      audioContext = null;
    }
  };

  /** Wire mic → worklet → socket once the transport is open, then hand-shake. */
  const _onSocketOpen = async (): Promise<void> => {
    callbacks.onConnected?.();
    const context = audioContext;
    const micStream = stream;
    if (!context || !micStream) return; // stop() won the race — nothing to wire
    try {
      const workletUrl = getWorkletBlobUrl(config.sampleRate, config.frameDurationMs);
      await context.audioWorklet.addModule(workletUrl);

      const workletNode = new AudioWorkletNode(context, 'pcm-worklet');
      workletNode.port.onmessage = (e) => {
        if (!formatSent) return;
        client.sendFrame(e.data as ArrayBuffer);
      };

      const source = context.createMediaStreamSource(micStream);
      source.connect(workletNode);
      processor = workletNode;

      client.sendFormat({
        sampleRate: config.sampleRate,
        channels: 1,
        sampleFormat: 's16le',
        bitDepth: 16,
      });
      formatSent = true;
      isRecording = true;
      callbacks.onRecordingStateChange(true);
    } catch (error) {
      console.error('[speechineer] Failed to initialize the microphone pipeline:', error);
      _cleanupAudio();
      _stopStream();
      callbacks.onRecordingStateChange(false);
    }
  };

  /** Single teardown path; runs at most once per run via the transport guard. */
  const _onSocketClosed = (): void => {
    // Disconnect / workflow-not-found / crash are detected on the lifeline WS
    // exclusively; here we just clean up local audio.
    _cleanupAudio();
    _stopStream();
    formatSent = false;
    isRecording = false;
    callbacks.onRecordingStateChange(false);
    callbacks.onDisconnected?.();
  };

  const client = createAudioClient(audioWsUrl, {
    onConnected: () => void _onSocketOpen(),
    onDisconnected: () => _onSocketClosed(),
  });

  const start = async (): Promise<void> => {
    if (isRecording) return;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      formatSent = false;

      const AudioContextClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContext = new AudioContextClass();

      client.connect();
    } catch (error) {
      // No microphone (permission denied, no device, no AudioContext): clean up and let the
      // caller report it — the session turns it into a typed error (MICROPHONE_DENIED, …).
      _cleanupAudio();
      _stopStream();
      callbacks.onRecordingStateChange(false);
      throw error;
    }
  };

  const stop = (): void => {
    // Tearing down the audio socket runs the single teardown path
    // (_onSocketClosed) via the transport's once-guarded onDisconnected.
    // The *intent* to stop recording is a `stop_recording_requested` signal the
    // workflow hook sends on the lifeline (the service ignores audio frames).
    client.disconnect();
  };

  return { start, stop };
}
