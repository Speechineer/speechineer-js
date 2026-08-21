/**
 * Behavior of the framework-agnostic session: the lifecycle, the connection statuses
 * (mirroring the sockets), values + transcript in the state, the derived flags, recovery,
 * main-connection loss, end/dispose, typed errors — driven through the internal
 * per-capability orchestration with fake transports.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowNotFoundError } from '../src/api/workflows/_post.js';
import { SpeechineerError } from '../src/errors.js';
import type { SessionState } from '../src/session/state.js';
import { answer, FakeWebSocket, flush, installFakeRecorder, installFakeWebSocket } from './fakes.js';

const recorder = installFakeRecorder();
const { createSpeechToFormWorkflowSession } = await import('../src/session/workflows/speech-to-form.js');
const { createTextToFormWorkflowSession } = await import('../src/session/workflows/text-to-form.js');

function speechToForm(overrides: Record<string, unknown> = {}) {
  const transitions: string[] = [];
  const params = {
    transcript: false,
    createWorkflow: vi.fn(async () => answer()),
    getWorkflow: vi.fn(async () => answer()),
    deleteWorkflow: vi.fn(async () => {}),
    onFieldValue: vi.fn(),
    onTranscript: vi.fn(),
    onSessionStart: vi.fn(),
    onError: vi.fn(),
    onStateChange: (s: SessionState) => transitions.push(summary(s)),
    ...overrides,
  };
  const session = createSpeechToFormWorkflowSession(params);
  return { session, params, transitions };
}

function summary(s: SessionState): string {
  const conns = Object.entries(s.connections)
    .map(([k, v]) => `${k}=${v?.status}`)
    .join(',');
  return `${s.status}|${conns}`;
}

beforeEach(() => {
  installFakeWebSocket();
  recorder.started = 0;
  recorder.stopped = 0;
  recorder.failNextStart = null;
});

describe('lifecycle', () => {
  it('starts idle with every declared connection closed, no values, no transcript, all flags off', () => {
    const { session } = speechToForm();
    expect(session.getState()).toEqual({
      status: 'idle',
      sessionId: null,
      error: null,
      connections: { session: { status: 'closed' }, audio: { status: 'closed' }, results: { status: 'closed' } },
      values: {},
      transcript: '',
      isListening: false,
      isConnecting: false,
      isEnding: false,
    });
  });

  it('initialValues are visible before start()', () => {
    const { session } = speechToForm({ initialValues: { age: 41 } });
    expect(session.getState().values).toEqual({ age: 41 });
  });

  it('start: idle → starting → active, id set, connections open as their sockets open, flags follow', async () => {
    const { session, params, transitions } = speechToForm();
    const p = session.start();
    expect(session.getState().status).toBe('starting');
    expect(session.getState().isConnecting).toBe(true);
    await p;
    expect(session.getState().status).toBe('active');
    expect(session.getState().sessionId).toBe('sess-1');
    expect(params.onSessionStart).toHaveBeenCalledWith('sess-1');
    expect(session.getState().connections.session.status).toBe('connecting');
    FakeWebSocket.byUrl('lifeline').open();
    FakeWebSocket.byUrl('form_data').open();
    expect(session.getState().connections).toEqual({
      session: { status: 'open' },
      audio: { status: 'open' },
      results: { status: 'open' },
    });
    expect(session.getState().isListening).toBe(true);
    expect(session.getState().isConnecting).toBe(false);
    expect(transitions[0]).toBe('starting|session=closed,audio=closed,results=closed');
    expect(transitions.at(-1)).toBe('active|session=open,audio=open,results=open');
  });

  it('a second start() while starting is a no-op (one session is created)', async () => {
    const { session, params } = speechToForm();
    const a = session.start();
    const b = session.start();
    await Promise.all([a, b]);
    expect(params.createWorkflow).toHaveBeenCalledTimes(1);
  });

  it('create failure → failed with a typed error in phase start; start() can retry', async () => {
    const { session, params } = speechToForm({
      createWorkflow: vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(answer()),
    });
    await session.start();
    expect(session.getState().status).toBe('failed');
    const err = session.getState().error;
    expect(err).toBeInstanceOf(SpeechineerError);
    expect(err).toMatchObject({ phase: 'start', code: 'UNKNOWN', message: 'boom', recoverable: true });
    expect(params.onError).toHaveBeenCalledTimes(1);
    expect(params.onError.mock.calls[0][0]).toBe(err);
    await session.start();
    expect(session.getState().status).toBe('active');
    expect(session.getState().error).toBeNull();
  });
});

describe('microphone', () => {
  it('a denied microphone → failed with MICROPHONE_DENIED (recoverable); start() again re-attaches and becomes active', async () => {
    const denied = new Error('Permission denied');
    denied.name = 'NotAllowedError';
    recorder.failNextStart = denied;
    const { session, params } = speechToForm();
    await session.start();
    expect(session.getState().status).toBe('failed');
    expect(session.getState().error).toMatchObject({ code: 'MICROPHONE_DENIED', phase: 'start', recoverable: true });
    expect(session.getState().isListening).toBe(false);
    expect(params.onError).toHaveBeenCalledTimes(1);
    await session.start();
    expect(params.createWorkflow).toHaveBeenCalledTimes(1); // the same session — no second create
    expect(session.getState().status).toBe('active');
    expect(session.getState().error).toBeNull();
    expect(session.getState().isListening).toBe(true);
  });
});

describe('connections mirror the sockets', () => {
  it('results: connecting → open → closed', async () => {
    const { session } = speechToForm();
    await session.start();
    expect(session.getState().connections.results?.status).toBe('connecting');
    FakeWebSocket.byUrl('form_data').open();
    expect(session.getState().connections.results?.status).toBe('open');
    FakeWebSocket.byUrl('form_data').serverClose(1000);
    expect(session.getState().connections.results?.status).toBe('closed');
  });

  it('field values land in state.values and reach onFieldValue; the same value again is not a new state', async () => {
    const { session, params } = speechToForm();
    await session.start();
    FakeWebSocket.byUrl('form_data').open();
    FakeWebSocket.byUrl('form_data').message({ fields: [{ field_id: 'name', value: 'Ada' }] });
    expect(session.getState().values).toEqual({ name: 'Ada' });
    expect(params.onFieldValue).toHaveBeenCalledWith('name', 'Ada');
    const before = session.getState();
    FakeWebSocket.byUrl('form_data').message({ fields: [{ field_id: 'name', value: 'Ada' }] });
    expect(session.getState()).toBe(before);
    FakeWebSocket.byUrl('form_data').message({ fields: [{ field_id: 'name', value: 'Ada L.' }] });
    expect(session.getState().values).toEqual({ name: 'Ada L.' });
  });

  it('stop(): audio open → closing (isEnding) → closed, and the stop signal goes over the session connection', async () => {
    const { session } = speechToForm();
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    expect(session.getState().connections.audio?.status).toBe('open');
    session.stop();
    expect(session.getState().connections.audio?.status).toBe('closing');
    expect(session.getState().isEnding).toBe(true);
    expect(session.getState().isListening).toBe(false);
    recorder.finishStop();
    expect(session.getState().connections.audio?.status).toBe('closed');
    expect(session.getState().isEnding).toBe(false);
    const sent = FakeWebSocket.byUrl('lifeline').sent.map((s) => JSON.parse(s).type);
    expect(sent).toEqual(['stop_recording_requested']);
    expect(session.getState().status).toBe('active');
  });

  it('stop() before start is a no-op', () => {
    const { session } = speechToForm();
    session.stop();
    expect(session.getState().status).toBe('idle');
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('start() again after stop re-attaches without a second create', async () => {
    const { session, params } = speechToForm();
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    FakeWebSocket.byUrl('form_data').open();
    session.stop();
    recorder.finishStop();
    await session.start();
    expect(params.createWorkflow).toHaveBeenCalledTimes(1);
    expect(recorder.started).toBe(2);
    expect(session.getState().isListening).toBe(true);
  });
});

describe('transcript', () => {
  it('transcript: true adds the transcript connection; snapshots land in state.transcript and reach onTranscript', async () => {
    const { session, params } = speechToForm({ transcript: true });
    expect(Object.keys(session.getState().connections)).toEqual(['session', 'audio', 'results', 'transcript']);
    await session.start();
    FakeWebSocket.byUrl('transcription').open();
    FakeWebSocket.byUrl('transcription').message({ text: 'hello world' });
    expect(session.getState().transcript).toBe('hello world');
    expect(params.onTranscript).toHaveBeenCalledWith('hello world');
    expect(session.getState().connections.transcript?.status).toBe('open');
  });

  it('without transcript there is no transcript connection and no transcription socket', async () => {
    const { session } = speechToForm();
    await session.start();
    expect(session.getState().connections.transcript).toBeUndefined();
    expect(FakeWebSocket.instances.filter((w) => w.url.includes('transcription'))).toHaveLength(0);
  });
});

describe('main connection', () => {
  it('lost (non-4404) → every connection torn down, status stays active; start() re-attaches', async () => {
    const { session, params } = speechToForm();
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    FakeWebSocket.byUrl('form_data').open();
    FakeWebSocket.byUrl('lifeline').serverClose(1006);
    expect(session.getState()).toMatchObject({
      status: 'active',
      sessionId: 'sess-1',
      isListening: false,
      connections: { session: { status: 'closed' }, audio: { status: 'closed' }, results: { status: 'closed' } },
    });
    expect(recorder.stopped).toBe(1);
    await session.start();
    expect(params.createWorkflow).toHaveBeenCalledTimes(1);
    FakeWebSocket.byUrl('lifeline').open();
    expect(session.getState().connections.session.status).toBe('open');
    expect(session.getState().connections.results?.status).toBe('connecting');
  });

  it('4404 → recovering (isConnecting) → active via get (same id), connections re-attached', async () => {
    const { session, params, transitions } = speechToForm();
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    FakeWebSocket.byUrl('lifeline').serverClose(4404);
    expect(session.getState().status).toBe('recovering');
    expect(session.getState().isConnecting).toBe(true);
    await flush();
    expect(params.getWorkflow).toHaveBeenCalledWith('sess-1');
    expect(params.createWorkflow).toHaveBeenCalledTimes(1);
    expect(session.getState().status).toBe('active');
    expect(session.getState().sessionId).toBe('sess-1');
    expect(FakeWebSocket.instances.filter((w) => w.url.includes('lifeline'))).toHaveLength(2);
    expect(transitions).toContain('recovering|session=closed,audio=closed,results=closed');
  });

  it('4404 → get 404 → create with resume target → fresh create', async () => {
    const getWorkflow = vi.fn().mockRejectedValue(new WorkflowNotFoundError());
    const createWorkflow = vi
      .fn()
      .mockResolvedValueOnce(answer('sess-1'))
      .mockRejectedValueOnce(new WorkflowNotFoundError())
      .mockResolvedValueOnce(answer('sess-2'));
    const { session, params } = speechToForm({ getWorkflow, createWorkflow });
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    FakeWebSocket.byUrl('lifeline').serverClose(4404);
    await flush();
    expect(createWorkflow).toHaveBeenNthCalledWith(2, 'sess-1');
    expect(createWorkflow.mock.calls[2]).toEqual([undefined]);
    expect(session.getState()).toMatchObject({ status: 'active', sessionId: 'sess-2' });
    expect(params.onSessionStart).toHaveBeenCalledTimes(2);
  });

  it('recovery failure → failed with phase recover', async () => {
    const { session } = speechToForm({
      getWorkflow: vi.fn().mockRejectedValue(new Error('down')),
    });
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    FakeWebSocket.byUrl('lifeline').serverClose(4404);
    await flush();
    expect(session.getState()).toMatchObject({ status: 'failed', error: { phase: 'recover', message: 'down' } });
  });

  it('a runtime failure reported on the session connection becomes a non-recoverable error in state and onError', async () => {
    const { session, params } = speechToForm();
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    FakeWebSocket.byUrl('lifeline').message({
      type: 'crash',
      verbosity: 'error',
      source: 'workflow',
      payload: { level: 'workflow', error_code: 'X1', message: 'kaput', detail: 'details' },
      session_id: 'sess-1',
      timestamp: 't',
    });
    const err = session.getState().error;
    expect(err).toMatchObject({ code: 'X1', phase: 'runtime', recoverable: false, detail: 'details' });
    expect(err?.message).toBe('kaput: details');
    expect(params.onError).toHaveBeenCalledTimes(1);
    expect(params.onError.mock.calls[0][0]).toBe(err);
  });

  it('every other signal reaches onEvent as a SessionEvent', async () => {
    const onEvent = vi.fn();
    const { session } = speechToForm({ onEvent });
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    FakeWebSocket.byUrl('lifeline').message({
      type: 'transcription_started',
      verbosity: 'info',
      source: 'transcription',
      payload: { a: 1 },
      session_id: 'sess-1',
      timestamp: 't',
    });
    expect(onEvent).toHaveBeenCalledWith({
      type: 'transcription_started',
      level: 'info',
      source: 'transcription',
      payload: { a: 1 },
      sessionId: 'sess-1',
      timestamp: 't',
    });
  });
});

describe('end / dispose', () => {
  it('end: ending → idle, DELETE once, everything closed, values back to initialValues; delete failure only warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const deleteWorkflow = vi.fn().mockRejectedValue(new Error('nope'));
    const { session, transitions } = speechToForm({ deleteWorkflow, initialValues: { age: 41 } });
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    FakeWebSocket.byUrl('form_data').open();
    FakeWebSocket.byUrl('form_data').message({ fields: [{ field_id: 'name', value: 'Ada' }] });
    expect(session.getState().values).toEqual({ age: 41, name: 'Ada' });
    await session.end();
    expect(deleteWorkflow).toHaveBeenCalledTimes(1);
    expect(session.getState()).toEqual({
      status: 'idle',
      sessionId: null,
      error: null,
      connections: { session: { status: 'closed' }, audio: { status: 'closed' }, results: { status: 'closed' } },
      values: { age: 41 },
      transcript: '',
      isListening: false,
      isConnecting: false,
      isEnding: false,
    });
    expect(transitions).toContain('ending|session=open,audio=open,results=open');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('end without start → idle, nothing deleted', async () => {
    const { session, params } = speechToForm();
    await session.end();
    expect(session.getState().status).toBe('idle');
    expect(params.deleteWorkflow).not.toHaveBeenCalled();
  });

  it('end during recovering still ends idle', async () => {
    let release: (v: unknown) => void = () => {};
    const getWorkflow = vi.fn(() => new Promise((r) => (release = r)));
    const { session, params } = speechToForm({ getWorkflow });
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    FakeWebSocket.byUrl('lifeline').serverClose(4404);
    expect(session.getState().status).toBe('recovering');
    await session.end();
    expect(session.getState().status).toBe('idle');
    // the vanished session is not deleted (nothing to delete), and the late recovery
    // result must not resurrect the session
    expect(params.deleteWorkflow).not.toHaveBeenCalled();
    release(answer());
    await flush();
    expect(session.getState().status).toBe('idle');
    expect(session.getState().sessionId).toBeNull();
  });

  it('dispose closes everything without DELETE and keeps the lifecycle', async () => {
    const { session, params } = speechToForm();
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    FakeWebSocket.byUrl('form_data').open();
    session.dispose();
    expect(params.deleteWorkflow).not.toHaveBeenCalled();
    expect(session.getState().status).toBe('active');
    expect(session.getState().connections).toEqual({
      session: { status: 'closed' },
      audio: { status: 'closed' },
      results: { status: 'closed' },
    });
    expect(FakeWebSocket.byUrl('form_data').readyState).toBe(FakeWebSocket.CLOSED);
  });
});

describe('text-to-form', () => {
  const base = (overrides: Record<string, unknown> = {}) => ({
    createWorkflow: vi.fn(async () => answer()),
    getWorkflow: vi.fn(async () => answer()),
    deleteWorkflow: vi.fn(async () => {}),
    extractText: vi.fn(async () => ({ name: 'Ada', age: 41 })),
    onFieldValue: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  });

  it('has only the session connection', () => {
    const s = createTextToFormWorkflowSession(base());
    expect(Object.keys(s.getState().connections)).toEqual(['session']);
  });

  it('extract opens the session on first use, merges the values into state, reaches onFieldValue, returns this call\'s values', async () => {
    const params = base();
    const s = createTextToFormWorkflowSession(params);
    const result = await s.extract('Patient Ada, 41');
    expect(params.createWorkflow).toHaveBeenCalledTimes(1);
    expect(params.extractText).toHaveBeenCalledWith('sess-1', 'Patient Ada, 41');
    expect(result).toEqual({ name: 'Ada', age: 41 });
    expect(s.getState().values).toEqual({ name: 'Ada', age: 41 });
    expect(s.getState().status).toBe('active');
    expect(params.onFieldValue).toHaveBeenCalledWith('name', 'Ada');
    expect(params.onFieldValue).toHaveBeenCalledWith('age', 41);
    await s.extract('again');
    expect(params.createWorkflow).toHaveBeenCalledTimes(1);
  });

  it('extract rejects with the start error when the session cannot be created', async () => {
    const s = createTextToFormWorkflowSession(base({ createWorkflow: vi.fn().mockRejectedValue(new Error('boom')) }));
    await expect(s.extract('x')).rejects.toMatchObject({ code: 'UNKNOWN', phase: 'start' });
    expect(s.getState().status).toBe('failed');
  });

  it('a rejected extract becomes a typed action error in state and onError, the session stays active', async () => {
    const params = base({ extractText: vi.fn().mockRejectedValue(new Error('nope')) });
    const s = createTextToFormWorkflowSession(params);
    await expect(s.extract('x')).rejects.toMatchObject({ code: 'UNKNOWN', phase: 'action', message: 'nope' });
    expect(s.getState().status).toBe('active');
    expect(s.getState().error).toMatchObject({ phase: 'action' });
    expect(params.onError).toHaveBeenCalledTimes(1);
  });
});

describe('onStateChange', () => {
  it('fires for every transition, in the same order a subscriber sees', async () => {
    const seen: string[] = [];
    const { session, transitions } = speechToForm();
    session.subscribe((s) => seen.push(summary(s)));
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    session.stop();
    recorder.finishStop();
    expect(transitions).toEqual(seen);
    expect(transitions.length).toBeGreaterThan(3);
  });
});
