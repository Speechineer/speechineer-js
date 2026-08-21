/**
 * The client: where requests go (`baseUrl`) and how sessions authenticate (`resolveAuth`,
 * called on every create / resume) — plus the public factories wired end to end against a
 * stubbed `fetch` (the POST URL and route per form source).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BASE_URL } from '../src/constants.js';
import { SpeechineerError } from '../src/errors.js';
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

    it('rejects with AUTH_REQUIRED when the provider returns nothing', async () => {
      const client = createClient({ token: () => '' });
      await expect(client.resolveAuth()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
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

    it('rejects with AUTH_REQUIRED without credentials and ACCOUNT_REQUIRED without an account', async () => {
      await expect(createClient().resolveAuth()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
      await expect(createClient({ apiKey: 'k' }).resolveAuth()).rejects.toMatchObject({ code: 'ACCOUNT_REQUIRED' });
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
        new Response(JSON.stringify({ ok: false, error: { code: 'FEATURE_NOT_AVAILABLE', message: 'no' } }), {
          status: 403,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onError = vi.fn();
    const session = createClient({ token: 't', baseUrl: 'http://x' }).speechToForm({ form: FORM, onError });
    await session.start();
    expect(session.getState().status).toBe('failed');
    expect(session.getState().error).toMatchObject({ code: 'FEATURE_NOT_AVAILABLE', phase: 'start', recoverable: true });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('an unreachable service surfaces NETWORK', async () => {
    installFakeWebSocket();
    fetchMock.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);
    const session = createClient({ token: 't', baseUrl: 'http://x' }).speechToForm({ form: FORM });
    await session.start();
    expect(session.getState().error).toMatchObject({ code: 'NETWORK', recoverable: true });
  });
});
