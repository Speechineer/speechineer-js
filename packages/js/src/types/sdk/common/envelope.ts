/**
 * Universal **response** envelope — mirrors the Speechineer API's response envelope.
 *
 * Response-only. Requests carry NO envelope — they are plain flat payloads (see
 * `types/sdk/workflows/*`). The SDK uses this to **parse** be→fe lifecycle answers:
 *
 * - Success: `{ ok: true,  data, meta }` — the typed answer lives under `data`.
 * - Failure: `{ ok: false, error, meta }` — rendered at the real HTTP status.
 *
 * (STTF actions + the lifeline are deliberately NOT enveloped yet.)
 */

/** One atom of an aggregated error breakdown or an advisory warning. */
export interface ErrorDetail {
  /** Stable machine-readable code (UPPER_SNAKE). */
  code: string;
  /** Human-readable, developer-facing description. */
  message: string;
  /** Offending field path, if any. */
  field?: string | null;
}

/** The failure `error` object: the shared atom + optional docs `type` + a `details[]` breakdown. */
export interface Problem {
  code: string;
  message: string;
  field?: string | null;
  meta?: Record<string, unknown> | null;
  /** URI to error docs. */
  type?: string | null;
  /** Aggregated breakdown (one atom per cause). */
  details?: ErrorDetail[];
}

/** Envelope meta — request id, advisory warnings, pagination, and the internal contract version. */
export interface Meta {
  request_id?: string | null;
  warnings?: ErrorDetail[];
  pagination?: Record<string, unknown> | null;
  /** Wire-contract version of the serving plane (internal API). */
  contract_version?: number | null;
}

/** Success wrapper: `{ ok: true, data, meta }`. `data` is the typed payload. */
export interface SuccessEnvelope<DataT> {
  ok: true;
  data: DataT;
  meta?: Meta;
}

/** Failure wrapper: `{ ok: false, error, meta }` (rendered at the real HTTP status). */
export interface FailureEnvelope {
  ok: false;
  error: Problem;
  meta?: Meta;
}
