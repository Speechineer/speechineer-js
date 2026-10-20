/**
 * The mistakes a developer actually makes, and what the SDK answers (FLY-503).
 *
 * Every other suite here is organised around our own structure — the client, the session, the
 * errors, conformance. This one is organised around **someone integrating for the first time
 * and getting it wrong**, because that is the population of failures that reaches support, and
 * because the codes only earn their keep if the wrong thing produces the right one.
 *
 * It uses the REAL client, the real session, the real converters and the real transport. Only
 * two things are faked, and both are browser APIs that cannot exist in node: the WebSocket and
 * the microphone. Where the SERVICE has to answer something, `fetch` is stubbed with the exact
 * envelope the service sends — the shape, not a paraphrase — because the mistake under test is
 * in the caller's code, not in the service.
 *
 * Contributor notes:
 * - **This is not a per-code matrix.** 80-odd codes cannot each be provoked by a caller mistake
 *   (nobody can make a vendor fail on cue), and a matrix would pin implementation rather than
 *   behaviour. What is here is the set a reasonable developer can actually cause.
 * - **The cases that need a real browser live elsewhere** — offline, a denied microphone, a
 *   capture stack the page may not build — in `portal-app/e2e/tests/sandbox-conditions.spec.ts`.
 *   No unit test can reach those.
 * - **Callbacks that throw are covered in `session.test.ts`**, next to the session behaviour
 *   they could break. One home per behaviour.
 * - Two cases here assert that **nothing** goes wrong. They are the most useful kind: a reader
 *   learns that double-clicking the talk button is safe and that a mismatched field id is
 *   silent, and the second is the one real integrators lose an afternoon to.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { answer, failed, FakeWebSocket, flush, installFakeRecorder, installFakeWebSocket, ok } from './fakes.js';

const recorder = installFakeRecorder();
installFakeWebSocket();
const { createClient } = await import('../src/client.js');

/** A published workspace form, named correctly. */
const FORM = { source: 'workspace', key: 'intake', version: '1', language: 'en' } as const;

/** Stub `fetch` with one answer, and record what was asked for. */
function stubFetch(body: unknown, status = 200) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWebSocket.instances = [];
});

// ---------------------------------------------------------------------------------------------
describe('setting the client up wrong', () => {
  it('no credentials at all: NO_AUTH, and nothing is sent', async () => {
    const calls = stubFetch(ok(answer()));
    // The commonest first-run mistake: reading the quickstart, writing `createClient()`, and
    // wiring the key in "later".
    const session = createClient().speechToForm({ form: FORM });

    await expect(session.start()).rejects.toMatchObject({ code: 'NO_AUTH', type: 'client' });
    // `client`, and the proof of what that category means: not one request left the browser.
    expect(calls).toEqual([]);
  });

  it('an apiKey with no account: NO_ACCOUNT, not a confusing refusal from the service', async () => {
    stubFetch(ok(answer()));
    // Unsigned mode needs to know WHO the session is for. Without this the service would have
    // to refuse it, and the developer would be debugging a 401 instead of reading one sentence.
    const session = createClient({ apiKey: 'spnr_live_k' }).speechToForm({ form: FORM });

    await expect(session.start()).rejects.toMatchObject({ code: 'NO_ACCOUNT' });
  });

  it('a token provider with a forgotten `return`: NO_AUTH, not a token of "undefined"', async () => {
    stubFetch(ok(answer()));
    // `async () => { fetchToken(); }` — the arrow-function body that drops its value. Easy to
    // write, and without this guard it would send the string "undefined" and get a 401 back.
    const forgotToReturn = (async () => {
      /* fetchToken() — and no `return` */
    }) as never;
    const session = createClient({ token: forgotToReturn }).speechToForm({ form: FORM });

    await expect(session.start()).rejects.toMatchObject({ code: 'NO_AUTH' });
  });

  it('a token endpoint that is down: NO_AUTH, keeping their own error as the cause', async () => {
    stubFetch(ok(answer()));
    class AuthServerDown extends Error {}
    const session = createClient({
      token: () => {
        throw new AuthServerDown('502 from /auth/token');
      },
    }).speechToForm({ form: FORM });

    const error = await session.start().catch((e: unknown) => e);
    // NO_AUTH, not UNKNOWN: this was the catch-all until FLY-503, which is how a plainly
    // diagnosable "my auth server is down" read as "Something went wrong".
    expect(error).toMatchObject({ code: 'NO_AUTH', type: 'client' });
    expect((error as { meta: { detail: string } }).meta.detail).toContain('502 from /auth/token');
    // Their class survives, so `cause instanceof AuthServerDown` is a usable branch.
    expect((error as { cause: unknown }).cause).toBeInstanceOf(AuthServerDown);
  });

  it('a typo in baseUrl sends the request to the typo — and the failure says NETWORK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const session = createClient({
      apiKey: 'k',
      account: { key: 'u1' },
      baseUrl: 'https://ai.speechineer.con/api', // .con, not .com
    }).speechToForm({ form: FORM });

    const error = await session.start().catch((e: unknown) => e);
    // NETWORK, and the browser's own text is in `meta.detail` — which is where the answer
    // actually is, because a DNS failure and a blocked origin look identical from here.
    expect(error).toMatchObject({ code: 'NETWORK', type: 'client' });
    expect((error as { meta: { detail: string } }).meta.detail).toContain('Failed to fetch');
  });
});

// ---------------------------------------------------------------------------------------------
describe('driving the lifecycle wrong', () => {
  const client = () => createClient({ apiKey: 'k', account: { key: 'u1' } });

  it('double-clicking the talk button creates ONE session, not two', async () => {
    const calls = stubFetch(ok(answer()));
    const session = client().speechToForm({ form: FORM });

    // No debounce on their button — the honest default for a first integration.
    await Promise.all([session.start(), session.start()]);

    expect(calls.filter((u) => u.includes('/create-')).length).toBe(1);
  });

  it('stop() before start() does nothing — it is not an error', async () => {
    stubFetch(ok(answer()));
    const onError = vi.fn();
    const session = client().speechToForm({ form: FORM, onError });

    // Their UI renders the stop button before any session exists.
    expect(() => session.stop()).not.toThrow();
    expect(onError).not.toHaveBeenCalled();
    expect(session.getState().status).toBe('idle');
  });

  it('a failing start() reaches BOTH the rejection and the state, so either style works', async () => {
    stubFetch(failed({ code: 'FORM_NOT_FOUND', type: 'not_found', dev_message: 'No form with that key.' }), 404);
    const onError = vi.fn();
    const session = client().speechToForm({ form: FORM, onError });

    // The developer who forgot to catch gets an unhandled rejection — their risk, and why every
    // snippet in the docs carries `.catch(() => {})`. The one who renders from the state gets
    // the same error without a try/catch. Both have to be true at once.
    await expect(session.start()).rejects.toMatchObject({ code: 'FORM_NOT_FOUND' });
    expect(session.getState().errors[0]).toMatchObject({ code: 'FORM_NOT_FOUND' });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('a session reused after end() starts again instead of staying broken', async () => {
    stubFetch(ok(answer()));
    const session = client().speechToForm({ form: FORM });
    await session.start();
    await session.end();
    expect(session.getState().status).toBe('idle');

    // Their component remounted and called start() on the object it still held.
    await session.start();

    expect(session.getState().status).toBe('active');
    expect(session.getState().errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
describe('naming the form wrong', () => {
  const client = () => createClient({ apiKey: 'k', account: { key: 'u1' } });

  it('a wrong key arrives as FORM_NOT_FOUND with its own category — never REQUEST_FAILED', async () => {
    stubFetch(
      failed({
        code: 'FORM_NOT_FOUND',
        type: 'not_found',
        dev_message: 'No form with key "intake-v2" in this workspace.',
        user_message: 'This form is not available.',
      }),
      404,
    );
    const onError = vi.fn();
    const session = client().speechToForm({ form: FORM, onError });

    await session.start().catch(() => {});

    const error = session.getState().errors[0];
    // The SPECIFIC code. Before FLY-502 every HTTP failure degraded to the SDK's own
    // REQUEST_FAILED with the raw body pasted in, for all 167 declarations at once.
    expect(error.code).toBe('FORM_NOT_FOUND');
    expect(error.type).toBe('not_found');
    // And both sentences, which is the whole point of the pair: one to show, one to log.
    expect(error.userMessage).toBe('This form is not available.');
    expect(error.devMessage).toBe('No form with key "intake-v2" in this workspace.');
    expect(error.message).toBe(error.devMessage);
  });

  it('a draft version is a DIFFERENT code from a missing form — the remedy differs', async () => {
    // Seven distinct 404s used to collapse into one generic NOT_FOUND, which told an integrator
    // nothing about which thing was missing. "Publish it" and "fix the key" are not the same job.
    stubFetch(failed({ code: 'FORM_VERSION_NOT_PUBLISHED', type: 'not_found' }), 404);
    const session = client().speechToForm({ form: { ...FORM, version: '7' } });

    await expect(session.start()).rejects.toMatchObject({ code: 'FORM_VERSION_NOT_PUBLISHED' });
  });

  it('a rejected form reports one error PER offending field, root cause first', async () => {
    // Their inline form has a select with no options and a slider with no range. The service
    // reports both at once; a caller that renders only `errors[0]` fixes one and comes back.
    stubFetch(
      failed(
        { code: 'OPTIONS_REQUIRED', type: 'validation', dev_message: '`insurance` is a select with no options.' },
        { code: 'RANGE_INVALID', type: 'validation', dev_message: '`pain` is a slider with no range.' },
        { code: 'VALIDATION_ERROR', type: 'validation', dev_message: 'Validation failed.' },
      ),
      422,
    );
    const onError = vi.fn();
    const session = client().speechToForm({ form: FORM, onError });

    await session.start().catch(() => {});

    expect(session.getState().errors.map((e) => e.code)).toEqual([
      'OPTIONS_REQUIRED',
      'RANGE_INVALID',
      'VALIDATION_ERROR',
    ]);
    // Once per element — a UI listing every reason can be built from the callback alone.
    expect(onError).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------------------------
describe('the mistake that produces no error at all', () => {
  it('a field id their code does not read: the value arrives and is silently unused', async () => {
    // THE trap. The docs' troubleshooting page has a row for it with no code, because there is
    // no failure anywhere: the form says `patientName`, their input is named `patient_name`,
    // and the value lands under a key nobody reads. Pinned as a test so the behaviour is a
    // decision rather than an accident — if we ever DID want to warn, this test is where the
    // conversation starts.
    stubFetch(ok(answer()));
    const onError = vi.fn();
    const onFieldValue = vi.fn();
    const session = createClient({ apiKey: 'k', account: { key: 'u1' } }).speechToForm({
      form: FORM,
      onError,
      onFieldValue,
    });
    await session.start();
    FakeWebSocket.byUrl('form_data').open();

    FakeWebSocket.byUrl('form_data').message({ fields: [{ field_id: 'patientName', value: 'Ada' }] });
    await flush();

    // Delivered under the service's id, which is the only one that exists.
    expect(onFieldValue).toHaveBeenCalledWith('patientName', 'Ada');
    expect(session.getState().values).toEqual({ patientName: 'Ada' });
    // Nothing failed, and nothing will tell them. The session is healthy.
    expect(onError).not.toHaveBeenCalled();
    expect(session.getState().errors).toEqual([]);
    expect(session.getState().status).toBe('active');
  });
});

// ---------------------------------------------------------------------------------------------
describe('calling the function instead of passing it', () => {
  it('token: getToken() rather than token: getToken says so, instead of sending junk', async () => {
    const calls = stubFetch(ok(answer()));
    const getToken = async () => 'signed.jwt.here';
    // One character of difference, and the single most plausible mistake on this surface.
    // What arrives is a Promise: truthy, so the old falsy check waved it through, and it
    // JSON-serialised to `{}` — Speechineer received an empty credential and refused it, so the
    // developer went debugging a 401 against their own token endpoint (FLY-503).
    const session = createClient({ token: getToken() as never }).speechToForm({ form: FORM });

    const error = await session.start().catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'NO_AUTH', type: 'client' });
    // The sentence names the fix rather than describing the symptom.
    expect((error as { meta: { detail: string } }).meta.detail).toContain('called instead of passed');
    // And nothing was sent, which is the proof the guard is in the right place.
    expect(calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
describe('what an action before start() really does', () => {
  // The catalogue documents `NO_SESSION` as "an action was called before start()". These three
  // cases are what the public surface ACTUALLY does, which is not that — `requireSessionId` is a
  // defensive guard with no caller-reachable path, because every action either opens the session
  // itself or is a no-op. Pinned so the surface is a decision, and so the gap between the
  // catalogue's sentence and the behaviour is visible rather than assumed. See the report.
  const client = () => createClient({ apiKey: 'k', account: { key: 'u1' } });

  it('extract() opens the session itself — it does not refuse', async () => {
    stubFetch(ok(answer()));
    const session = client().textToForm({ form: FORM });

    // Their first user types before anything called start(). This is designed to work.
    await session.extract('Ada Lovelace, 36').catch(() => {});

    expect(session.getState().sessionId).toBe('sess-1');
  });

  it('end() before start() resolves quietly rather than failing', async () => {
    stubFetch(ok(answer()));
    const onError = vi.fn();
    const session = client().speechToForm({ form: FORM, onError });

    // Their cleanup runs on unmount whether or not anything started.
    await expect(session.end()).resolves.toBeUndefined();
    expect(onError).not.toHaveBeenCalled();
    expect(session.getState().status).toBe('idle');
  });

  it('a disposed session can still be started — dispose releases, it does not poison', async () => {
    stubFetch(ok(answer()));
    const session = client().speechToForm({ form: FORM });
    await session.start();
    session.dispose();

    // React strict mode mounts, unmounts and remounts; the second mount calls start() on a
    // session the first one disposed.
    await session.start();

    expect(session.getState().status).toBe('active');
  });
});

// ---------------------------------------------------------------------------------------------
describe('the language the person is shown', () => {
  it('uiLanguage: "de" puts the SDK\'s own sentences in German, message stays English', async () => {
    stubFetch(ok(answer()));
    // The failure is one the SDK raises itself, so the SDK's catalogue is what renders it —
    // there is no service in the loop to translate anything.
    const session = createClient({ uiLanguage: 'de' }).speechToForm({ form: FORM });

    const error = await session.start().catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'NO_AUTH' });
    // What the person reads.
    expect((error as { userMessage: string }).userMessage).toBe('Diese Anwendung ist nicht korrekt eingerichtet.');
    // What the log reads — English, always, whatever the UI language is.
    expect((error as { devMessage: string }).devMessage).toContain('No credentials');
    expect((error as { message: string }).message).toBe((error as { devMessage: string }).devMessage);
  });

  it('a session overrides the client for a failure the SESSION raises', async () => {
    stubFetch(ok(answer()));
    // One client, many users — the per-session option exists for exactly this. A denied
    // microphone is raised inside the session, so it reads the session's language thunk
    // (`h.current.uiLanguage ?? client.uiLanguage`) and the override lands.
    const denied = new Error('Permission denied');
    denied.name = 'NotAllowedError';
    recorder.failNextStart = denied;
    const client = createClient({ apiKey: 'k', account: { key: 'u1' }, uiLanguage: 'en' });
    const session = client.speechToForm({ form: FORM, uiLanguage: 'de' });

    const error = await session.start().catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'MICROPHONE_DENIED' });
    expect((error as { userMessage: string }).userMessage).toContain('Mikrofon');
  });

  it('…and a CREDENTIAL failure honours it too, which is the multi-tenant case', async () => {
    // `NO_AUTH` and `NO_ACCOUNT` are raised inside `client.resolveAuth()`, which took only an
    // account and so had no way to know the session's language — these two rendered in the
    // CLIENT's while everything raised in the session honoured the override. Fixed in FLY-503
    // by widening the signature; this is the case that was broken, so it is the case pinned:
    // one client, many users, this one German.
    stubFetch(ok(answer()));
    const client = createClient({ uiLanguage: 'en' });
    const session = client.speechToForm({ form: FORM, uiLanguage: 'de' });

    const error = await session.start().catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'NO_AUTH' });
    expect((error as { userMessage: string }).userMessage).toBe('Diese Anwendung ist nicht korrekt eingerichtet.');
    // The developer half stays English whatever the UI language is.
    expect((error as { devMessage: string }).devMessage).toContain('No credentials');
  });
});

// ---------------------------------------------------------------------------------------------
describe('calling an action too early for the SERVICE', () => {
  it('a refused action says ACTION_PRECONDITION_UNMET and leaves the session alive', async () => {
    // Unlike the local guards above, this one is Speechineer's answer: the call was well formed
    // and arrived too early for the thing it needs. The session survives — a refused action is
    // not a dead session, and `status` has to keep saying so or a UI tears itself down.
    const session = createClient({ apiKey: 'k', account: { key: 'u1' } }).textToForm({ form: FORM });
    stubFetch(ok(answer()));
    await session.start();

    stubFetch(
      failed({
        code: 'ACTION_PRECONDITION_UNMET',
        type: 'conflict',
        dev_message: 'Nothing has been transcribed yet, so there is nothing to extract.',
      }),
      409,
    );
    await expect(session.extract('')).rejects.toMatchObject({ code: 'ACTION_PRECONDITION_UNMET' });

    expect(session.getState().errors[0]).toMatchObject({ code: 'ACTION_PRECONDITION_UNMET' });
    // Still usable: the next extract can succeed.
    expect(session.getState().sessionId).toBe('sess-1');
  });
});
