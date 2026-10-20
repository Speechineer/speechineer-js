/**
 * Behavior of the framework-agnostic session: the lifecycle, the connection statuses
 * (mirroring the sockets), values + transcript in the state, the derived flags, recovery,
 * main-connection loss, end/dispose, typed errors — driven through the internal
 * per-capability orchestration with fake transports.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeechineerError, sdkError } from '../src/errors/index.js';
import type { SessionState } from '../src/session/state.js';
import {
  answer,
  failed,
  FakeWebSocket,
  flush,
  frame,
  installFakeRecorder,
  installFakeWebSocket,
  ok,
} from './fakes.js';

const recorder = installFakeRecorder();
const { createSpeechToFormWorkflowSession } = await import('../src/session/workflows/speech-to-form.js');
const { createTextToFormWorkflowSession } = await import('../src/session/workflows/text-to-form.js');

function speechToForm(overrides: Record<string, unknown> = {}) {
  const transitions: string[] = [];
  const params = {
    transcript: false,
    createWorkflow: vi.fn(async () => ok(answer())),
    getWorkflow: vi.fn(async () => ok(answer())),
    deleteWorkflow: vi.fn(async () => ok(null)),
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
      errors: [],
      requestId: null,
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

  it('create failure → failed with a typed error; start() can retry', async () => {
    const { session, params } = speechToForm({
      createWorkflow: vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(ok(answer())),
    });
    // Rejects AND reports: a UI bound to the state needs no try/catch, but `await start()`
    // on a session that never started must not resolve as though it had.
    await expect(session.start()).rejects.toMatchObject({ code: 'UNKNOWN' });
    expect(session.getState().status).toBe('failed');
    const err = session.getState().errors[0];
    expect(err).toBeInstanceOf(SpeechineerError);
    expect(err).toMatchObject({ code: 'UNKNOWN', type: 'client' });
    expect(err.message).toContain('boom');
    expect(params.onError).toHaveBeenCalledTimes(1);
    expect(params.onError.mock.calls[0][0]).toBe(err);
    await session.start();
    expect(session.getState().status).toBe('active');
    expect(session.getState().errors).toEqual([]);
  });
});

describe('microphone', () => {
  it('a denied microphone → failed with MICROPHONE_DENIED; start() again re-attaches and becomes active', async () => {
    const denied = new Error('Permission denied');
    denied.name = 'NotAllowedError';
    recorder.failNextStart = denied;
    const { session, params } = speechToForm();
    await expect(session.start()).rejects.toMatchObject({ code: 'MICROPHONE_DENIED' });
    expect(session.getState().status).toBe('failed');
    expect(session.getState().errors[0]).toMatchObject({ code: 'MICROPHONE_DENIED', type: 'client' });
    expect(session.getState().isListening).toBe(false);
    expect(params.onError).toHaveBeenCalledTimes(1);
    await session.start();
    expect(params.createWorkflow).toHaveBeenCalledTimes(1); // the same session — no second create
    expect(session.getState().status).toBe('active');
    expect(session.getState().errors).toEqual([]);
    expect(session.getState().isListening).toBe(true);
  });

  it('a capture pipeline that fails AFTER start reports a real error, not a console line', async () => {
    // FLY-503. The worklet is loaded on the audio socket's `open` event, which lands after
    // `start()` has resolved — so this failure has no promise to reject and no caller to throw
    // at. It used to go to `console.error` and nowhere else: a content security policy that
    // blocks `blob:` workers left the microphone granted, the socket open and NOTHING on the
    // session. The uncatchable `console.warn` is exactly what this contract removes.
    const { session, params } = speechToForm();
    await session.start();
    expect(session.getState().isListening).toBe(true);

    // What the real recorder hands to `onFailure`: it mints the code itself, since only it
    // knows the failure is the audio stack rather than the microphone. The fake replaces the
    // real recorder wholesale, so that minting is not exercised here — what this pins is that
    // the failure REACHES the session at all, which is what went to `console.error` before.
    recorder.failPipeline(
      sdkError('AUDIO_UNSUPPORTED', {
        meta: { detail: 'Refused to load the worklet: violates the CSP' },
        cause: new Error('Refused to load the worklet: violates the CSP'),
      }),
    );

    // It reaches the hook AND the state, like every other failure.
    expect(params.onError).toHaveBeenCalledTimes(1);
    const err = session.getState().errors[0];
    expect(err).toMatchObject({ code: 'AUDIO_UNSUPPORTED', type: 'client' });
    // The underlying text is what diagnoses it, so it rides `meta` rather than replacing the
    // declaration's sentence.
    expect(err.meta?.detail).toContain('violates the CSP');
    // The SESSION is not declared dead: its main connection and the service-side session are
    // both still live. What is true is reported — the audio connection is closed and nothing is
    // listening.
    expect(session.getState().isListening).toBe(false);
    expect(session.getState().connections.audio?.status).toBe('closed');
    expect(session.getState().status).toBe('active');
  });
});

describe('a callback of the app\'s own is never allowed to break the session', () => {
  // FLY-503. These are the app's functions running inside our control flow. Before they were
  // guarded, three things went wrong, and each is pinned below.
  //
  // **Fake timers, because `safely()` re-throws on a fresh task.** That is the whole point of it
  // — the app's bug has to reach `window.onerror` rather than vanish — but in a test runner a
  // throw on a real timer lands nowhere a test can see, and vitest counts it as an unhandled
  // error: the suite then printed every test as passing and still exited non-zero, which is how
  // these two leaked past a run I had called green. Holding the timers lets each test ASSERT the
  // re-throw instead, so the contract is checked rather than merely survived.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Drops any re-throw still pending — a listener that throws on every state change queues
    // one per transition, and only the first is asserted.
    vi.useRealTimers();
  });

  it('a throwing onError still lets onEvent fire, and start() rejects with the REAL failure', async () => {
    // `failWith` reports and then returns the value `start()` throws, so a throwing `onError`
    // used to replace the rejection — the app caught its own bug instead of the failure it was
    // handling, while `state.errors` held the right thing. The two sources disagreed.
    const onEvent = vi.fn();
    const onError = vi.fn(() => {
      throw new Error('the app\'s own handler is broken');
    });
    const { session, params } = speechToForm({ onError, onEvent });
    params.createWorkflow.mockRejectedValueOnce(new Error('boom'));

    await expect(session.start()).rejects.toMatchObject({ code: 'UNKNOWN' });
    expect(session.getState().errors[0]).toMatchObject({ code: 'UNKNOWN' });
    // The report that was meant to follow onError still happened.
    expect(onEvent).toHaveBeenCalledTimes(1);
    // And the app's own bug is not swallowed — it surfaces on its own task, which is where an
    // error reporter can see it.
    expect(() => vi.runAllTimers()).toThrow("the app's own handler is broken");
  });

  it('a throwing subscribe listener does not starve the ones after it', async () => {
    // `setState` notified in a bare loop, so one throwing listener aborted it and every
    // listener registered later silently stopped receiving state. A framework binding plus the
    // app's own `subscribe()` is the normal case, so this was real loss with no symptom.
    const { session } = speechToForm();
    const second = vi.fn();
    session.subscribe(() => {
      throw new Error('the first listener is broken');
    });
    session.subscribe(second);

    await session.start();

    expect(second).toHaveBeenCalled();
    expect(() => vi.runAllTimers()).toThrow('the first listener is broken');
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
    // The frame's level names the field the event sits under, so the code is read from there —
    // the old top-level `event` name is gone from the contract.
    const sent = FakeWebSocket.byUrl('lifeline').sent.map((s) => JSON.parse(s).info?.code);
    expect(sent).toEqual(['STOP_RECORDING_REQUESTED']);
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

describe('restart re-seeds the service', () => {
  // What the app holds only ever crosses the wire on create and get, so a restart that
  // re-attached silently left everything a user typed while stopped stranded in the browser.
  // These pin that every route out of a restart carries the `state` scope instead.

  it('start() after stop() re-seeds the live session through get, with no second create', async () => {
    const { session, params } = speechToForm();
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    session.stop();
    recorder.finishStop();

    await session.start();

    expect(params.getWorkflow).toHaveBeenCalledWith('sess-1');
    expect(params.createWorkflow).toHaveBeenCalledTimes(1);
    expect(session.getState()).toMatchObject({ status: 'active', sessionId: 'sess-1' });
  });

  it('re-seeding the same session is not announced as a new one', async () => {
    const { session, params } = speechToForm();
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    session.stop();
    recorder.finishStop();

    await session.start();

    // The id did not change, so nothing was started — announcing it would make every play
    // look like a new session to anyone counting them.
    expect(params.onSessionStart).toHaveBeenCalledTimes(1);
  });

  it('a session archived while stopped is rebuilt through create with the old id', async () => {
    // `WORKFLOW_NOT_FOUND` is the code the resume chain advances on — renamed from
    // `SESSION_NOT_FOUND` by the protocol, which is the rename that silently broke this chain.
    const getWorkflow = vi.fn().mockResolvedValue(failed({ code: 'WORKFLOW_NOT_FOUND', type: 'not_found', dev_message: 'gone' }));
    const createWorkflow = vi.fn().mockResolvedValueOnce(ok(answer('sess-1'))).mockResolvedValueOnce(ok(answer('sess-2')));
    const { session, params } = speechToForm({ getWorkflow, createWorkflow });
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    session.stop();
    recorder.finishStop();

    await session.start();

    expect(createWorkflow).toHaveBeenNthCalledWith(2, 'sess-1');
    expect(session.getState()).toMatchObject({ status: 'active', sessionId: 'sess-2' });
    // A new id really is a new session, so this one IS announced.
    expect(params.onSessionStart).toHaveBeenCalledTimes(2);
  });

  it('end() while the re-seed is in flight does not resurrect the session', async () => {
    let releaseGet: (a: ReturnType<typeof ok<ReturnType<typeof answer>>>) => void = () => {};
    const getWorkflow = vi.fn(
      () =>
        new Promise<ReturnType<typeof ok<ReturnType<typeof answer>>>>((resolve) => {
          releaseGet = resolve;
        }),
    );
    const { session } = speechToForm({ getWorkflow });
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    session.stop();
    recorder.finishStop();

    const restarting = session.start();
    await session.end();
    releaseGet(ok(answer('sess-1')));
    await restarting;
    await flush();

    // The restart now awaits the network, so a cancel can land mid-flight; adopting what
    // came back afterwards would undo the end the user just asked for.
    expect(session.getState().status).toBe('idle');
  });

  it('a session minted while the user was cancelling is deleted, not left orphaned', async () => {
    let releaseCreate: (a: ReturnType<typeof ok<ReturnType<typeof answer>>>) => void = () => {};
    const getWorkflow = vi.fn().mockResolvedValue(failed({ code: 'WORKFLOW_NOT_FOUND', type: 'not_found', dev_message: 'gone' }));
    const createWorkflow = vi
      .fn()
      .mockResolvedValueOnce(ok(answer('sess-1')))
      .mockImplementationOnce(
        () =>
          new Promise<ReturnType<typeof ok<ReturnType<typeof answer>>>>((resolve) => {
            releaseCreate = resolve;
          }),
      );
    const { session, params } = speechToForm({ getWorkflow, createWorkflow });
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    session.stop();
    recorder.finishStop();

    const restarting = session.start();
    await flush(); // let the get reject so the create is the call in flight
    await session.end();
    releaseCreate(ok(answer('sess-2')));
    await restarting;
    await flush();

    // Nothing references sess-2, so without this it would sit service-side burning quota
    // until the idle reaper collected it.
    expect(params.deleteWorkflow).toHaveBeenCalledWith(expect.objectContaining({ session_id: 'sess-2' }));
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
    const gone = () => failed({ code: 'WORKFLOW_NOT_FOUND', type: 'not_found', dev_message: 'gone' });
    const getWorkflow = vi.fn().mockResolvedValue(gone());
    const createWorkflow = vi
      .fn()
      .mockResolvedValueOnce(ok(answer('sess-1')))
      .mockResolvedValueOnce(gone())
      .mockResolvedValueOnce(ok(answer('sess-2')));
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

  it('recovery failure → failed, carrying what actually failed', async () => {
    const { session } = speechToForm({
      getWorkflow: vi.fn().mockRejectedValue(new Error('down')),
    });
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    FakeWebSocket.byUrl('lifeline').serverClose(4404);
    await flush();
    expect(session.getState().status).toBe('failed');
    // What actually failed, not a generic "recovery failed": the thrown reason rides
    // `meta.detail` and is interpolated into the declaration's sentence.
    expect(session.getState().errors[0]).toMatchObject({ code: 'UNKNOWN' });
    expect(session.getState().errors[0].devMessage).toContain('down');
  });

  it.each([
    [
      'a component failed',
      {
        code: 'EXTRACTION_FAILED',
        type: 'runtime',
        dev_message: 'Field extraction could not be restarted.',
        user_message: 'Die Verarbeitung wurde unterbrochen.',
      },
    ],
    [
      'the allowance ran out',
      {
        code: 'ACCOUNT_QUOTA_EXCEEDED',
        type: 'quota',
        dev_message: 'This account has used 1000 of its 1000 units.',
        user_message: 'Das Guthaben ist aufgebraucht.',
        meta: { limit: '1000', used: '1000', remaining: '0', layer: 'account:month' },
      },
    ],
  ])('%s → the session ends, reported through state.errors and onError', async (_why, error) => {
    // BOTH are endings, and the SDK must treat them alike. It used to test the event NAME, so a
    // spent allowance arrived as an informational event and the app was never told the session
    // had stopped — the one failure a caller most needs to act on (FLY-492 / D-42). Now the
    // LEVEL is the terminality and nothing else is consulted.
    const { session, params } = speechToForm();
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    FakeWebSocket.byUrl('lifeline').message(frame('error', error));

    // The status says the session is over, so `status` can be trusted on its own. It used to
    // stay `active` with only `errors` populated, which made "is this session usable" a
    // two-field question nothing documented.
    expect(session.getState().status).toBe('failed');
    const err = session.getState().errors[0];
    expect(err).toMatchObject({ code: error.code, type: error.type });
    // Both sentences survive the frame — the reader on the screen and the reader in the logs.
    expect(err.userMessage).toBe(error.user_message);
    expect(err.devMessage).toBe(error.dev_message);
    expect(err.meta).toEqual((error as { meta?: Record<string, unknown> }).meta ?? null);
    expect(params.onError).toHaveBeenCalledTimes(1);
    // The same instance on both channels — a caller never has to reconcile two objects.
    expect(params.onError.mock.calls[0][0]).toBe(err);
  });

  it('the close frame does not report the ending a second time', async () => {
    // The frame and the close describe one ending. The close normally follows the frame, and
    // reporting both would show the app two failures for one stopped session — and the frame is
    // the better report, since a close frame cannot carry sentences or meta.
    const { session, params } = speechToForm();
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    FakeWebSocket.byUrl('lifeline').message(
      frame('error', { code: 'EXTRACTION_FAILED', type: 'runtime', dev_message: 'kaput' }),
    );
    FakeWebSocket.byUrl('lifeline').serverClose(4500, 'runtime:EXTRACTION_FAILED');

    expect(params.onError).toHaveBeenCalledTimes(1);
    expect(session.getState().errors[0]).toMatchObject({ code: 'EXTRACTION_FAILED' });
  });

  it('a connection opened after the session ended is still told, by its close frame alone', async () => {
    // Nobody was listening when the failure was reported, so the close frame is all there is.
    // Before this, that case reached the client as silence (D7) — and then, for a release, as a
    // locally invented `SESSION_ENDED` that the service had never sent.
    const { session, params } = speechToForm();
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    FakeWebSocket.byUrl('lifeline').serverClose(4500, 'runtime:EXTRACTION_FAILED');

    expect(params.onError).toHaveBeenCalledTimes(1);
    // The REAL code and category, read off the reason — not a placeholder derived from 4500,
    // which could not have distinguished `runtime` from `service` or `client` anyway.
    expect(session.getState().errors[0]).toMatchObject({
      code: 'EXTRACTION_FAILED',
      type: 'runtime',
    });
    // A close frame has no room for sentences, so the user-facing one is the SDK's own generic
    // line — and it claims only that the connection closed.
    expect(session.getState().errors[0].userMessage).toBe('Something went wrong.');
  });

  it('a session that died can be started again, which is what `failed` promises', async () => {
    // `failed` documents "start() may be called again", so the promise is worth a test — and it
    // exercises the resume chain end to end, which is the thing that was quietly broken: the
    // guard waited for a code the service had renamed, so this never got past the first `get`.
    const { session, params } = speechToForm();
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    FakeWebSocket.byUrl('lifeline').message(
      frame('error', { code: 'EXTRACTION_FAILED', type: 'runtime', dev_message: 'kaput' }),
    );
    expect(session.getState().status).toBe('failed');

    await session.start();

    expect(session.getState().status).toBe('active');
    // The previous failure is cleared rather than lingering next to a live session.
    expect(session.getState().errors).toEqual([]);
    // Re-seeded through `get`, not re-created: the session id still named something live.
    expect(params.getWorkflow).toHaveBeenCalledTimes(1);
    expect(params.createWorkflow).toHaveBeenCalledTimes(1);
  });

  it('a close frame with no reason at all is still reported, as UNKNOWN', async () => {
    // An older service, or a proxy closing on its behalf. The SDK says what it knows and no
    // more, rather than guessing at one of the service's codes.
    const { session, params } = speechToForm();
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    FakeWebSocket.byUrl('lifeline').serverClose(4500, '');

    expect(params.onError).toHaveBeenCalledTimes(1);
    expect(session.getState().errors[0]).toMatchObject({ code: 'UNKNOWN', type: 'client' });
    expect(session.getState().errors[0].devMessage).toContain('4500');
  });

  it('a non-terminal frame reaches its own level hook AND onEvent', async () => {
    // Before this, every one of these arrived blank: the reader looked for `event`/`verbosity`/
    // `data`, and the frame had moved to `{level, <level>, meta}` — so each notice was
    // delivered and then silently discarded.
    const onEvent = vi.fn();
    const onWarning = vi.fn();
    const onInfo = vi.fn();
    const { session } = speechToForm({ onEvent, onWarning, onInfo });
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    FakeWebSocket.byUrl('lifeline').message(
      frame('warning', {
        code: 'TRANSCRIPTION_DOWN',
        type: 'recovery',
        dev_message: 'Transcription dropped; retrying.',
        user_message: 'Die Spracherkennung wird neu verbunden.',
        meta: { retry_attempt: 1 },
      }),
    );

    const notice = {
      level: 'warning',
      code: 'TRANSCRIPTION_DOWN',
      type: 'recovery',
      devMessage: 'Transcription dropped; retrying.',
      userMessage: 'Die Spracherkennung wird neu verbunden.',
      meta: { retry_attempt: 1 },
    };
    expect(onWarning).toHaveBeenCalledWith(notice);
    // `onEvent` receives everything, which is the whole point of an error and a notice sharing
    // one shape.
    expect(onEvent).toHaveBeenCalledWith(notice);
    // ...and only its own level's hook fires.
    expect(onInfo).not.toHaveBeenCalled();
  });

  it('a failure reaches onError AND onEvent, because an error is an event', async () => {
    const onEvent = vi.fn();
    const onWarning = vi.fn();
    const { session, params } = speechToForm({ onEvent, onWarning });
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    FakeWebSocket.byUrl('lifeline').message(
      frame('error', { code: 'EXTRACTION_FAILED', type: 'runtime', dev_message: 'kaput' }),
    );

    expect(params.onError).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0]).toBe(params.onError.mock.calls[0][0]);
    expect(onEvent.mock.calls[0][0].level).toBe('error');
    expect(onWarning).not.toHaveBeenCalled();
  });

  it('a frame this build cannot read is dropped, not raised', async () => {
    // Forward compatibility: a newer service adding a shape must not break an older app. The
    // service applies the same rule to the frames this SDK sends it.
    const onEvent = vi.fn();
    const { session, params } = speechToForm({ onEvent });
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    FakeWebSocket.byUrl('lifeline').message({ level: 'telepathy', telepathy: { code: 'X' } });
    FakeWebSocket.byUrl('lifeline').message({ level: 'warning' }); // level with no payload
    FakeWebSocket.byUrl('lifeline').message({ nonsense: true });

    expect(onEvent).not.toHaveBeenCalled();
    expect(params.onError).not.toHaveBeenCalled();
    expect(session.getState().status).toBe('active');
  });

  it('sends a client frame in the shape the service reads', async () => {
    // The service's reader answers `None` for anything else and drops the frame in SILENCE, so
    // a shape mismatch here does not fail loudly — it just means the stop gesture does nothing,
    // which is exactly what happened for a release (§7c-1).
    const { session } = speechToForm();
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    session.stop();

    const sent = FakeWebSocket.byUrl('lifeline').sent.map((s) => JSON.parse(s));
    expect(sent).toContainEqual(
      expect.objectContaining({
        level: 'info',
        info: { code: 'STOP_RECORDING_REQUESTED' },
      }),
    );
  });
});

describe('end / dispose', () => {
  it('end: ending → idle, DELETE once, everything closed, values back to initialValues; a failed delete rejects', async () => {
    const deleteWorkflow = vi.fn().mockRejectedValue(new Error('nope'));
    const { session, transitions } = speechToForm({ deleteWorkflow, initialValues: { age: 41 } });
    await session.start();
    FakeWebSocket.byUrl('lifeline').open();
    FakeWebSocket.byUrl('form_data').open();
    FakeWebSocket.byUrl('form_data').message({ fields: [{ field_id: 'name', value: 'Ada' }] });
    expect(session.getState().values).toEqual({ age: 41, name: 'Ada' });
    // The local teardown still completes — the app reaches `idle` either way — but the caller
    // is told the session may still be running on the server, which a console.warn never did.
    await expect(session.end()).rejects.toMatchObject({ code: 'UNKNOWN' });
    expect(session.getState().errors[0].devMessage).toContain('nope');
    expect(deleteWorkflow).toHaveBeenCalledTimes(1);
    expect(session.getState()).toMatchObject({
      status: 'idle',
      sessionId: null,
      connections: { session: { status: 'closed' }, audio: { status: 'closed' }, results: { status: 'closed' } },
      values: { age: 41 },
      transcript: '',
      isListening: false,
      isConnecting: false,
      isEnding: false,
    });
    expect(transitions).toContain('ending|session=open,audio=open,results=open');
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
    release(ok(answer()));
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
    createWorkflow: vi.fn(async () => ok(answer())),
    getWorkflow: vi.fn(async () => ok(answer())),
    deleteWorkflow: vi.fn(async () => ok(null)),
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
    await expect(s.extract('x')).rejects.toMatchObject({ code: 'UNKNOWN' });
    expect(s.getState().status).toBe('failed');
  });

  it('a rejected extract becomes a typed action error in state and onError, the session stays active', async () => {
    const params = base({ extractText: vi.fn().mockRejectedValue(new Error('nope')) });
    const s = createTextToFormWorkflowSession(params);
    await expect(s.extract('x')).rejects.toMatchObject({ code: 'UNKNOWN' });
    expect(s.getState().status).toBe('active');
    expect(s.getState().errors[0]).toMatchObject({ code: 'UNKNOWN' });
    expect(s.getState().errors[0].devMessage).toContain('nope');
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
