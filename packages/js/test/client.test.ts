/**
 * The client: where requests go (`baseUrl`) and how sessions authenticate (`resolveAuth`,
 * called on every create / resume) — plus the public factories wired end to end against a
 * stubbed `fetch` (the POST URL and route per form source).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BASE_URL } from '../src/constants.js';
import { sdkError, SpeechineerError } from '../src/errors/index.js';
import { answer, decodeJwt, installFakeRecorder, installFakeWebSocket } from './fakes.js';

// The fake recorder must be registered BEFORE the client module graph (→ channels → recorder) loads.
installFakeRecorder();
const { createClient } = await import('../src/client.js');

const FORM = { source: 'workspace', key: 'intake', version: '1', language: 'en' } as const;

describe('createClient', () => {
  it('defaults baseUrl to the production API and strips trailing slashes', () => {
    expect(createClient({ apiKey: 'k' }).baseUrl).toBe(DEFAULT_BASE_URL);
    expect(createClient({ apiKey: 'k', baseUrl: 'https://x.example/api///' }).baseUrl).toBe('https://x.example/api');
  });

  describe('resolveAuth', () => {
    it('forwards a token string verbatim', async () => {
      expect(await createClient({ token: 'signed.jwt.here' }).resolveAuth()).toBe('signed.jwt.here');
    });

    it('asks a token provider on every call, so a fresh token is used each time', async () => {
      let n = 0;
      const client = createClient({ token: async () => `t${n++}` });
      expect(await client.resolveAuth()).toBe('t0');
      expect(await client.resolveAuth()).toBe('t1');
    });

    it('rejects with NO_AUTH when the provider returns nothing', async () => {
      const client = createClient({ token: () => '' });
      // NO_AUTH, not AUTH_REQUIRED: this is the app's own wiring, caught before anything is
      // sent. AUTH_REQUIRED is Speechineer refusing a credential that did travel — sharing one
      // code meant a caller could not tell a missing config from a revoked key (D-41).
      await expect(client.resolveAuth()).rejects.toMatchObject({ code: 'NO_AUTH', type: 'client' });
    });

    it('rejects with NO_AUTH when the provider THROWS, keeping what it threw as the cause', async () => {
      // The same failure as returning nothing — no credential was obtained, so nothing is sent —
      // and until FLY-503 only the other half was named: a throw fell through to the generic
      // funnel and arrived as `UNKNOWN`, the catch-all nobody can branch on. Every provider we
      // ship throws (the sandbox when its tenant is logged out, the portal's demo and Feedback
      // dialog when theirs is paused), so this was the common path.
      class LoggedOut extends Error {}
      const client = createClient({
        token: () => {
          throw new LoggedOut('Not logged in — log in to the tenant first.');
        },
      });

      const error = await client.resolveAuth().catch((e: unknown) => e);
      expect(error).toMatchObject({ code: 'NO_AUTH', type: 'client' });
      // The provider's own text is what diagnoses it, so it has to survive — on `meta`, not by
      // replacing the declaration's sentence.
      expect((error as { meta: { detail: string } }).meta.detail).toBe(
        'Not logged in — log in to the tenant first.',
      );
      // And the original object itself: a provider that throws its own class relies on
      // `error.cause instanceof MyError` to tell its state apart (the portal's demo does
      // exactly this to detect a paused demo).
      expect((error as { cause: unknown }).cause).toBeInstanceOf(LoggedOut);
    });

    it('lets a provider raise one of OUR errors deliberately, untouched', async () => {
      // A provider that already knows what to say should not be re-wrapped as NO_AUTH.
      const client = createClient({
        token: () => {
          throw sdkError('NO_ACCOUNT', { meta: { detail: 'the kiosk has no account yet' } });
        },
      });
      await expect(client.resolveAuth()).rejects.toMatchObject({ code: 'NO_ACCOUNT' });
    });

    it('mints an unsigned token from apiKey + the client account', async () => {
      const client = createClient({ apiKey: 'spnr_live_k', account: { key: 'u1', pseudonym: 'Desk 1' } });
      const { payload } = decodeJwt(await client.resolveAuth());
      expect(payload).toMatchObject({ api_key: 'spnr_live_k', account_key: 'u1', account_pseudonym: 'Desk 1' });
    });

    it('a session account overrides the client account', async () => {
      const client = createClient({ apiKey: 'k', account: { key: 'default' } });
      const { payload } = decodeJwt(await client.resolveAuth({ key: 'kiosk-3' }));
      expect(payload.account_key).toBe('kiosk-3');
    });

    it('rejects with NO_AUTH without credentials and NO_ACCOUNT without an account', async () => {
      await expect(createClient().resolveAuth()).rejects.toMatchObject({ code: 'NO_AUTH' });
      await expect(createClient({ apiKey: 'k' }).resolveAuth()).rejects.toMatchObject({ code: 'NO_ACCOUNT' });
      const err = await createClient({ apiKey: 'k' })
        .resolveAuth()
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SpeechineerError);
    });
  });
});

describe('sessions from the client (stubbed fetch)', () => {
  const fetchMock = vi.fn();

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  function stubFetch() {
    installFakeWebSocket();
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ ok: true, data: answer() }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
  }

  it('speechToForm: a workspace form POSTs create-portal under the client baseUrl with the minted auth', async () => {
    stubFetch();
    const client = createClient({ apiKey: 'k', account: { key: 'u1' }, baseUrl: 'http://x/api' });
    const session = client.speechToForm({ form: FORM });
    await session.start();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://x/api/v1/workflows/speech-to-form/create-portal');
    const body = JSON.parse(String(init.body));
    expect(decodeJwt(body.auth).payload.account_key).toBe('u1');
    expect(body.workflow).toEqual({ workflow_key: 'speech_to_form' });
    expect(body.feature).toEqual({ form_key: 'intake', form_version_key: '1', form_config_language: 'en' });
    expect(session.getState().status).toBe('active');
  });

  it('speechToForm: an inline form POSTs create-standalone; transcript: true selects the with-transcription route', async () => {
    stubFetch();
    const client = createClient({ apiKey: 'k', account: { key: 'u1' }, baseUrl: 'http://x' });
    await client
      .speechToForm({
        form: { source: 'inline', key: 'intake', version: '1', language: 'en', fields: [] },
        transcript: true,
      })
      .start();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://x/v1/workflows/speech-to-form-with-transcription/create-standalone');
    expect(JSON.parse(String(init.body)).workflow).toEqual({ workflow_key: 'speech_to_form_with_transcription' });
  });

  // The language a session renders in has two places it can be set and one place it is
  // resolved. These pin the precedence, because it is the part that reads ambiguously: the
  // client holds the app-wide default, a session may override it, and the resolved value is
  // what reaches the wire as `state.ui_language` — which is what makes the SERVICE translate
  // its own messages, not just the SDK.
  const stateOfFirstCall = (): Record<string, unknown> =>
    JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).state;

  it("sends the client's uiLanguage as the session's language", async () => {
    stubFetch();
    const client = createClient({ apiKey: 'k', account: { key: 'u1' }, baseUrl: 'http://x', uiLanguage: 'de' });
    await client.speechToForm({ form: FORM }).start();

    expect(stateOfFirstCall().ui_language).toBe('de');
  });

  it("lets one session override the client's language without touching the others", async () => {
    stubFetch();
    const client = createClient({ apiKey: 'k', account: { key: 'u1' }, baseUrl: 'http://x', uiLanguage: 'de' });
    await client.speechToForm({ form: FORM, uiLanguage: 'en' }).start();

    expect(stateOfFirstCall().ui_language).toBe('en');
  });

  it('sends no language when neither names one, so the service negotiates it', async () => {
    // Omission is meaningful: the service falls back to `Accept-Language` on create and keeps
    // the current language on a resume. A blank would read as "switch to nothing".
    stubFetch();
    const client = createClient({ apiKey: 'k', account: { key: 'u1' }, baseUrl: 'http://x' });
    await client.speechToForm({ form: FORM }).start();

    expect(stateOfFirstCall()).not.toHaveProperty('ui_language');
  });

  // …and the same language on the REQUEST, not only in its body (FLY-503). `state.ui_language`
  // governs what the session reports over its own connection; a create / get / delete / action
  // that FAILS is answered by the HTTP layer, which negotiates from `Accept-Language`. Setting
  // one and not the other is how `uiLanguage: 'de'` produced a German session that answered
  // `FORM_NOT_FOUND` in English — the failure an integrator is most likely to meet first.
  const headersOfFirstCall = (): Record<string, string> =>
    ((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers ?? {}) as Record<string, string>;

  it('asks for the session language on the request itself, so a FAILED create is translated too', async () => {
    stubFetch();
    const client = createClient({ apiKey: 'k', account: { key: 'u1' }, baseUrl: 'http://x', uiLanguage: 'de' });
    await client.speechToForm({ form: FORM }).start();

    expect(headersOfFirstCall()['Accept-Language']).toBe('de');
  });

  it('omits the header when no language was named, leaving the browser to negotiate', async () => {
    // Same reasoning as the body above: silence is the documented default, and a hardcoded
    // 'en' here would override a browser that asked for German.
    stubFetch();
    const client = createClient({ apiKey: 'k', account: { key: 'u1' }, baseUrl: 'http://x' });
    await client.speechToForm({ form: FORM }).start();

    expect(headersOfFirstCall()).not.toHaveProperty('Accept-Language');
  });

  it("renders the SDK's own messages in the session's language too", async () => {
    // The other half: these never reach a backend, so nothing translates them but the SDK. A
    // session showing German service text and English SDK text would be the bug this prevents.
    installFakeWebSocket();
    fetchMock.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = createClient({ token: 't', baseUrl: 'http://x', uiLanguage: 'de' });
    const session = client.speechToForm({ form: FORM });

    await expect(session.start()).rejects.toMatchObject({ code: 'NETWORK' });
    expect(session.getState().errors[0].userMessage).toBe('Speechineer konnte nicht erreicht werden.');
    // The developer half stays English — it is read by whoever integrates, not by the visitor.
    expect(session.getState().errors[0].message).toContain('Could not reach Speechineer');
  });

  it('textToForm: extract auto-starts (create-portal) and then POSTs the extract action', async () => {
    installFakeWebSocket();
    fetchMock
      .mockImplementationOnce(async () => new Response(JSON.stringify({ ok: true, data: answer() }), { status: 200 }))
      .mockImplementationOnce(
        async () => new Response(JSON.stringify({ fields: [{ field_id: 'name', value: 'Ada' }] }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const client = createClient({ token: 'signed', baseUrl: 'http://x' });
    const session = client.textToForm({ form: FORM });
    const values = await session.extract('Ada');
    expect(values).toEqual({ name: 'Ada' });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'http://x/v1/workflows/text-to-form/create-portal',
      'http://x/v1/workflows/text-to-form/extract',
    ]);
    expect(JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body))).toEqual({
      session_id: 'sess-1',
      text: 'Ada',
    });
    expect(session.getState().values).toEqual({ name: 'Ada' });
  });

  it('a rejected create surfaces the service error code', async () => {
    installFakeWebSocket();
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            ok: false,
            errors: [
              {
                code: 'FEATURE_NOT_AVAILABLE',
                type: 'access',
                user_message: 'Das ist nicht verfügbar.',
                message: 'That feature is not enabled for this workspace.',
              },
            ],
            meta: { request_id: 'req-1' },
          }),
          { status: 403 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onError = vi.fn();
    const session = createClient({ token: 't', baseUrl: 'http://x' }).speechToForm({ form: FORM, onError });
    await expect(session.start()).rejects.toMatchObject({ code: 'FEATURE_NOT_AVAILABLE' });
    expect(session.getState().status).toBe('failed');
    // The service's own code reaches the app intact — this is the defect the ticket opened on:
    // ~45 portal codes used to flatten into a bare "Request failed" with `code: null`, and then
    // every one of them flattened into `REQUEST_FAILED` once the envelope grew an `errors` list
    // that this SDK was still reading as a singular `error`.
    expect(session.getState().errors[0]).toMatchObject({
      code: 'FEATURE_NOT_AVAILABLE',
      type: 'access',
    });
    // Both sentences arrive, for their two different readers.
    expect(session.getState().errors[0].userMessage).toBe('Das ist nicht verfügbar.');
    expect(session.getState().errors[0].message).toBe(
      'That feature is not enabled for this workspace.',
    );
    // The request id rides the envelope's meta, not the error.
    expect(session.getState().requestId).toBe('req-1');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('reports every failure a single answer carried, root cause first', async () => {
    installFakeWebSocket();
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            ok: false,
            errors: [
              { code: 'UNIT_MAPPING_MISSING', type: 'conflict', message: 'no mapping' },
              { code: 'INTERNAL_ERROR', type: 'service', message: 'wrapped' },
            ],
          }),
          { status: 409 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onError = vi.fn();
    const session = createClient({ token: 't', baseUrl: 'http://x' }).speechToForm({ form: FORM, onError });
    // The thrown value is the ROOT cause, which is the informative one.
    await expect(session.start()).rejects.toMatchObject({ code: 'UNIT_MAPPING_MISSING' });
    // Nothing is dropped: the whole list is on the state, in the order the service sent it.
    expect(session.getState().errors.map((e) => e.code)).toEqual([
      'UNIT_MAPPING_MISSING',
      'INTERNAL_ERROR',
    ]);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('an unreachable service surfaces NETWORK', async () => {
    installFakeWebSocket();
    fetchMock.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);
    const session = createClient({ token: 't', baseUrl: 'http://x' }).speechToForm({ form: FORM });
    await expect(session.start()).rejects.toMatchObject({ code: 'NETWORK' });
    expect(session.getState().errors[0]).toMatchObject({ code: 'NETWORK', type: 'client' });
    // The underlying reason rides `meta`, interpolated into the developer sentence rather than
    // replacing it.
    expect(session.getState().errors[0].message).toContain('Failed to fetch');
  });
});
