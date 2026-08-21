/**
 * Shared POST helpers for the workflow endpoints.
 *
 * The API root (`baseUrl`) is owned by the client and passed in by the session factories — it
 * is never read from module state. Lifecycle (create / get) posts a **flat** request and returns
 * the answer's `data` object (unwrapped from the response envelope `{ ok, data, meta }`); delete
 * expects 204; actions post a custom body and return a raw (non-enveloped) result.
 */

import type { SuccessEnvelope } from '../../types/sdk/common/envelope.js';

/**
 * Thrown when a workflow request 404s: a create whose `session_id` resume target names no
 * archived session, a get on a workflow that is not live, or a delete / action on a workflow that
 * is gone. The session catches this to drive the get → create-on-404 resume chain.
 *
 * @internal
 */
export class WorkflowNotFoundError extends Error {
  constructor(message = 'Workflow not found') {
    super(message);
    this.name = 'WorkflowNotFoundError';
  }
}

/**
 * A request the service rejected (non-2xx, non-404) or that never reached it (`status 0`,
 * `code 'NETWORK'`). `code` is the stable error code from the failure envelope when present.
 *
 * @internal
 */
export class RequestError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly cause?: unknown;

  constructor(message: string, status: number, code: string | null, cause?: unknown) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

async function post(baseUrl: string, path: string, request: unknown): Promise<Response> {
  try {
    return await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new RequestError(`Could not reach Speechineer: ${reason}`, 0, 'NETWORK', e);
  }
}

/** Best-effort error info: FailureEnvelope `error.message` + `error.code`, a plain `detail` field, else raw text. */
async function errorInfo(res: Response): Promise<{ message: string; code: string | null }> {
  const raw = await res.text().catch(() => '');
  try {
    const body = JSON.parse(raw) as {
      error?: { message?: string; code?: string; error_code?: string };
      detail?: unknown;
    };
    const code = body.error?.code ?? body.error?.error_code ?? null;
    if (body.error?.message) return { message: body.error.message, code };
    if (typeof body.detail === 'string') return { message: body.detail, code };
  } catch {
    /* not JSON — fall through to the raw text */
  }
  return { message: raw, code: null };
}

async function rejectWith(res: Response, what: string): Promise<never> {
  const { message, code } = await errorInfo(res);
  throw new RequestError(`${what} failed (${res.status})${message ? `: ${message}` : ''}`, res.status, code);
}

/**
 * POST a flat request to a create / get endpoint and return the answer's `data` object (unwrapped
 * from the response envelope). Throws {@link WorkflowNotFoundError} on 404 so the session can
 * resume; a {@link RequestError} on any other non-2xx.
 */
export async function postForData<Data>(baseUrl: string, path: string, request: unknown): Promise<Data> {
  const res = await post(baseUrl, path, request);
  if (res.status === 404) {
    throw new WorkflowNotFoundError((await errorInfo(res)).message);
  }
  if (!res.ok) {
    await rejectWith(res, 'Workflow request');
  }
  const answer = (await res.json()) as SuccessEnvelope<Data>;
  return answer.data;
}

/** POST a flat request to a delete endpoint (204 No Content). A 404 is tolerated (already gone). */
export async function postForDelete(baseUrl: string, path: string, request: unknown): Promise<void> {
  const res = await post(baseUrl, path, request);
  if (!res.ok && res.status !== 404) {
    await rejectWith(res, 'Workflow delete');
  }
}

/**
 * POST a custom action body and return its raw (non-enveloped) JSON result.
 * Throws {@link WorkflowNotFoundError} on 404; a {@link RequestError} on any other non-2xx
 * (e.g. 409 precondition unmet, 504 timeout).
 */
export async function postForResult<Result>(baseUrl: string, path: string, request: unknown): Promise<Result> {
  const res = await post(baseUrl, path, request);
  if (res.status === 404) {
    throw new WorkflowNotFoundError((await errorInfo(res)).message);
  }
  if (!res.ok) {
    await rejectWith(res, 'Workflow action');
  }
  return (await res.json()) as Result;
}
