/**
 * Shared POST helpers for the workflow endpoints.
 *
 * The API root (`baseUrl`) is owned by the client and passed in by the session factories — it is
 * never read from module state. Lifecycle (create / get) posts a **flat** request; only the
 * answer is enveloped.
 *
 * Contributor notes (not rendered):
 * - **These return the envelope for every outcome and never throw.** `ok` is the wire's own
 *   discriminant, so the caller narrows on it. Two reasons. First, `errors` is a *list*: a
 *   `throw` carries one value, so a throwing transport either drops the rest of the list or
 *   smuggles it through a field on the exception. Second, it is how "creation never rejects" is
 *   implemented — the session layer writes `errors` into its state rather than catching its own
 *   throw. Exceptions are raised at the public boundary (`start()`, an action), where a JS caller
 *   expects one. A network that never answered is an envelope too, so there is no second shape
 *   for "it failed before the service saw it".
 * - **This layer speaks the wire.** `errors[]` comes back as events, not as error classes;
 *   turning them into classes is `convert/`'s job. That is why an SDK-minted failure is built
 *   with `sdkEvent` rather than `sdkError` here.
 * - **A failure's `errors[]` is cause-ordered, root cause first**, so `errors[0]` is the
 *   informative one and supplies the status and the class. The later entries are the wrappers
 *   around it, not its causes — which is why nothing threads them onto `Error.cause`, a field
 *   that means the underlying *throwable*.
 * - A body that is not an envelope at all still produces a failure — a proxy or a gateway can
 *   answer on the service's behalf — and that is the one case `REQUEST_FAILED` exists for.
 */

import { negotiateSdkLanguage, type SdkLanguage, sdkEvent } from '../../errors/manifest.js';
import type { Envelope, FailureEnvelope, SuccessEnvelope } from '../../types/sdk/common/envelope.js';

/**
 * One SDK-minted failure, in the envelope's own shape.
 *
 * `language` here is **what the app asked for**, so it may be absent — and absent is meaningful
 * one line down, where it decides whether the request pins `Accept-Language`. These sentences
 * still need a concrete language, since nothing but the SDK will ever translate them, so the
 * browser's own preference is the fallback: the same rule as the session's, applied at the moment
 * of rendering rather than before the request, which is what keeps the two uses from colliding.
 */
function failure(
  code: 'NETWORK' | 'REQUEST_FAILED',
  meta: Record<string, unknown>,
  language?: SdkLanguage,
): FailureEnvelope {
  return {
    ok: false,
    errors: [sdkEvent(code, { meta, language: language ?? negotiateSdkLanguage() })],
    meta: {},
  };
}

/** The raw response, or the failure envelope for a request that never got one. */
async function post(
  baseUrl: string,
  path: string,
  request: unknown,
  language?: SdkLanguage,
): Promise<Response | FailureEnvelope> {
  try {
    return await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // `uiLanguage`, asked for over the wire (FLY-503). Speechineer declares every
        // `userMessage` per language and renders the one this header asks for. Without it, a
        // create / get / delete that FAILS was translated from the browser's preference instead
        // of the session's — so `uiLanguage: 'de'` gave a German session that answered
        // `FORM_NOT_FOUND` in English, the failure an integrator meets first. The split was
        // visible inside one call: `NETWORK` above is the SDK's own sentence and was already
        // German.
        //
        // **Absent when the app named nothing**, which is the whole reason this takes the
        // requested language and not the resolved one. The resolved one falls back to
        // `navigator.language`, a single tag — while the header the browser would have sent is a
        // q-weighted list. A visitor on `fr-FR,fr;q=0.9,de;q=0.8` is answered in German by that
        // list and in English by the single tag, so pinning the guess would have *lost* a
        // translation to look like it was adding one.
        ...(language ? { 'Accept-Language': language } : {}),
      },
      body: JSON.stringify(request),
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return failure('NETWORK', { detail }, language);
  }
}

/** The parsed body, the raw text when it is not JSON, or `null` when there is nothing to parse. */
async function bodyOf(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  const raw = await res.text().catch(() => '');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Read the failure the service sent: its `errors[]` and the `meta` the answer carried.
 *
 * Falls back to `REQUEST_FAILED` for a body that is not the envelope, because failing to parse a
 * failure must still produce one.
 */
function failureFrom(res: Response, body: unknown, language?: SdkLanguage): FailureEnvelope {
  const envelope = body as Partial<FailureEnvelope> | null;
  if (Array.isArray(envelope?.errors) && envelope.errors.length > 0) {
    return { ok: false, errors: envelope.errors, meta: envelope.meta ?? {} };
  }
  const detail = typeof body === 'string' ? body : body ? JSON.stringify(body) : '';
  return failure('REQUEST_FAILED', { status: res.status, body: detail }, language);
}

/**
 * POST a flat request to a create / get endpoint and return the whole answer.
 *
 * The success half keeps its `meta` — the advisory `warnings` / `infos` / `debugs` the service
 * raised about this very request, and the `request_id` that spans the whole call. Dropping it
 * here is what used to make those notices unreachable.
 */
export async function postForData<Data>(
  baseUrl: string,
  path: string,
  request: unknown,
  language?: SdkLanguage,
): Promise<Envelope<Data>> {
  const res = await post(baseUrl, path, request, language);
  if (!(res instanceof Response)) return res;
  const body = await bodyOf(res);
  if (!res.ok) return failureFrom(res, body, language);
  const envelope = body as SuccessEnvelope<Data>;
  return { ok: true, data: envelope.data, meta: envelope.meta ?? {} };
}

/**
 * POST a flat request to a delete endpoint (204 No Content).
 *
 * A `404` counts as success: the session is already gone, which is what the caller wanted.
 */
export async function postForDelete(
  baseUrl: string,
  path: string,
  request: unknown,
  language?: SdkLanguage,
): Promise<Envelope<null>> {
  const res = await post(baseUrl, path, request, language);
  if (!(res instanceof Response)) return res;
  if (res.ok || res.status === 404) return { ok: true, data: null, meta: {} };
  return failureFrom(res, await bodyOf(res), language);
}

/**
 * POST a custom action body and return its raw result.
 *
 * Actions are deliberately **unenveloped on success** — the body *is* the result — while their
 * failures go through the same envelope as everything else.
 */
export async function postForResult<Result>(
  baseUrl: string,
  path: string,
  request: unknown,
  language?: SdkLanguage,
): Promise<Envelope<Result>> {
  const res = await post(baseUrl, path, request, language);
  if (!(res instanceof Response)) return res;
  const body = await bodyOf(res);
  if (!res.ok) return failureFrom(res, body, language);
  return { ok: true, data: body as Result, meta: {} };
}
