/**
 * Shared POST helpers for the workflow endpoints.
 *
 * The API root (`baseUrl`) is owned by the client and passed in by the session factories — it
 * is never read from module state. Lifecycle (create / get) posts a **flat** request and returns
 * the answer's `data` object (unwrapped from the response envelope `{ ok, data, meta }`); delete
 * expects 204; actions post a custom body and return a raw (non-enveloped) result.
 *
 * **Every failure here becomes a `SpeechineerError` built from the service's own `error`
 * object.** There are no transport-specific error classes any more: a rejected request and a
 * session that stopped mid-run reach the app as the same type, carrying the same code. The two
 * classes that used to live here flattened ~45 service codes into two, which is how a wrong
 * form version surfaced as a bare "Request failed" with `code: null`.
 */

import { fromProblem } from '../../convert/inbound/common/problem.js';
import type { SpeechineerError } from '../../errors/base.js';
import { sdkError } from '../../errors/manifest.js';
import type { SuccessEnvelope } from '../../types/sdk/common/envelope.js';
import type { ProblemSdk } from '../../types/sdk/common/problem.js';

async function post(baseUrl: string, path: string, request: unknown): Promise<Response> {
  try {
    return await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw sdkError('NETWORK', { message: `Could not reach Speechineer: ${reason}`, cause: e });
  }
}

/**
 * Read the failure the service sent: the envelope's `error` object, plus the request id from
 * its `meta` so a caller can quote it.
 *
 * Falls back progressively — a body that is not the envelope, then one that is not JSON at all
 * — because a proxy or a gateway can answer on the service's behalf, and failing to parse a
 * failure must still produce one.
 */
async function failureFrom(res: Response): Promise<SpeechineerError> {
  const raw = await res.text().catch(() => '');
  try {
    const body = JSON.parse(raw) as { error?: ProblemSdk; meta?: { request_id?: string } };
    if (body.error?.code) {
      return fromProblem(body.error, { requestId: body.meta?.request_id ?? null });
    }
  } catch {
    /* not JSON — fall through */
  }
  return sdkError('REQUEST_FAILED', {
    message: raw
      ? `The request was rejected (${res.status}): ${raw}`
      : `The request was rejected (${res.status}).`,
  });
}

/**
 * POST a flat request to a create / get endpoint and return the answer's `data` object
 * (unwrapped from the response envelope).
 */
export async function postForData<Data>(baseUrl: string, path: string, request: unknown): Promise<Data> {
  const res = await post(baseUrl, path, request);
  if (!res.ok) throw await failureFrom(res);
  const answer = (await res.json()) as SuccessEnvelope<Data>;
  return answer.data;
}

/** POST a flat request to a delete endpoint (204 No Content). A 404 is tolerated (already gone). */
export async function postForDelete(baseUrl: string, path: string, request: unknown): Promise<void> {
  const res = await post(baseUrl, path, request);
  if (!res.ok && res.status !== 404) throw await failureFrom(res);
}

/**
 * POST a custom action body and return its raw (non-enveloped) JSON result.
 */
export async function postForResult<Result>(baseUrl: string, path: string, request: unknown): Promise<Result> {
  const res = await post(baseUrl, path, request);
  if (!res.ok) throw await failureFrom(res);
  return (await res.json()) as Result;
}
