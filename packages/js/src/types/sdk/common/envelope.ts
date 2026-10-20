/**
 * The HTTP response envelope. Mirrors `speechineer_protocol.transport.http`.
 *
 * Response-only: requests carry NO envelope — they are plain flat payloads (`types/sdk/workflows/*`).
 *
 * ```
 * success: { ok: true,  data, meta: { request_id?, warnings[], infos[], debugs[], pagination? } }
 * failure: { ok: false, errors: [ … ], meta: { request_id? } }
 * ```
 *
 * Contributor notes (not rendered):
 * - **`errors` is a list, and it is not optional on a failure.** It is cause-ordered, root cause
 *   first, built by walking the service's exception chain — so `errors[0]` is the one that
 *   supplies the status and the class to raise, and the rest are the context it was wrapped in.
 *   The old singular `error` object is gone. Reading the old key is what made every failure
 *   arrive as `REQUEST_FAILED` with the body pasted into the message.
 * - **The metas are separate types, because the asymmetry is the contract.** `warnings` appears
 *   only beside `data`, never beside `errors`. A shared meta would document four keys that can
 *   never appear on half the responses.
 * - **An empty key is an absent key.** The notice arrays are omitted when empty rather than sent
 *   as `[]`, so read them with a default.
 */

import type { EventSdk } from './event.js';

/** What every answer's meta carries. */
interface AnswerMetaSdk {
  /**
   * One id spanning the whole call: this SDK's request reaches the service, which forwards it to
   * its own upstream, which echoes it back. Quote it in a bug report and the whole path is
   * greppable.
   */
  request_id?: string | null;
}

/** A success's meta: the request id, the advisory notices, and pagination where it applies. */
export interface SuccessMetaSdk extends AnswerMetaSdk {
  /** Advisory: something was not honoured as asked, but the call succeeded. */
  warnings?: EventSdk[];
  /** Progress worth reporting. */
  infos?: EventSdk[];
  /** Trace-level detail — present only for a caller running at `debug`. */
  debugs?: EventSdk[];
  pagination?: Record<string, unknown> | null;
}

/**
 * A failure's meta: the request id, and deliberately nothing else.
 *
 * Its own type rather than a reuse of the success meta — see the note above.
 */
export type FailureMetaSdk = AnswerMetaSdk;

/** `{ ok: true, data, meta }` — the typed answer lives under `data`. */
export interface SuccessEnvelope<DataT> {
  ok: true;
  data: DataT;
  meta?: SuccessMetaSdk;
}

/** `{ ok: false, errors, meta }` — rendered at the status `errors[0]`'s category answers with. */
export interface FailureEnvelope {
  ok: false;
  errors: EventSdk[];
  meta?: FailureMetaSdk;
}

/**
 * Either half, discriminated by `ok` exactly as the wire discriminates them.
 *
 * This is what the transport hands back for **every** outcome, including a network that never
 * answered — so there is one shape to narrow on and no second vocabulary for "the call failed
 * before the service saw it".
 */
export type Envelope<DataT> = SuccessEnvelope<DataT> | FailureEnvelope;
