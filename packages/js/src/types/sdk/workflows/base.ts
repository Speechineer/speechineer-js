/**
 * Shared SDK ↔ service base scopes for the flat lifecycle contract (both directions) —
 * mirrors the Speechineer API's base schemas. Each workflow's `types/sdk/workflows/<workflow>.ts`
 * extends these.
 *
 * **Flat, no envelope on the way in** (requests are plain payloads); the be→fe answer is the
 * `data` object (`ResolveResponseSdkBase`) that the transport unwraps out of the response
 * envelope (`SuccessEnvelope`) — see `api/workflows/_post.ts`.
 *
 * **Naming (whole boundary).** Every class carries its side as a marker — `Sdk` (fe ↔ be) —
 * placed as a **suffix on the role, immediately before an optional `Base`** (marker at the very
 * end when there is no `Base`); a workflow prefix, when present, leads. So `FeatureRequestSdkBase`
 * (subclassed base), `DeleteRequestSdk` (shared concrete), `SpeechToFormConnectionResponseSdk`
 * (per-workflow concrete). This mirrors the be side name-for-name.
 *
 * `session_id` is a **flat top-level string** on every request/answer (no `session` object) —
 * harmonised with the portal.
 */

// --- create request scopes (fe → be) ---------------------------------------

/** Base `workflow` request scope every create request carries (forwarded to the portal on create). */
export interface WorkflowRequestSdkBase {
  workflow_key: string;
  /**
   * Standalone-mode per-provider adapter-config pins `{ provider_key: adapter_config_key }`
   * (forwarded to the standalone resolve route). Portal mode omits them — the portal resolves
   * adapters from the form.
   */
  adapter_config_keys?: Record<string, string> | null;
}

/** Base `feature` request scope every create request carries (forwarded to the portal). */
export interface FeatureRequestSdkBase {
  form_key: string;
  form_version_key: string;
  /** Form/prompt language selector for the localized FormVersion (e.g. `'en'`, `'de'`). */
  form_config_language: string;
}

/**
 * Base top-level `state` request scope (fe → be) — FE-owned restore data, **be-local**.
 * Empty base; each workflow narrows it (field values + the optional `transcription_language`
 * the service reads at runtime). Stripped before the portal forward.
 */
// biome-ignore lint/suspicious/noEmptyInterface: mirrors be's empty StateRequestSdkBase (narrowed per workflow).
export interface StateRequestSdkBase {}

/**
 * Base top-level fe→be **create** request: `auth` + an optional `session_id` resume target +
 * the three flat scopes. Subclassed per workflow to narrow `workflow` / `feature` / `state`.
 */
export interface ResolveRequestSdkBase {
  /** Compact JWT (api_key + account claims); forwarded to the portal verbatim, never decoded. */
  auth: string;
  /**
   * Resume target: names an archived session to re-resolve + rebuild; absent = a fresh create.
   * Forwarded to the portal as `workflow.session_id` when resuming (create owns resume).
   */
  session_id?: string | null;
  workflow: WorkflowRequestSdkBase;
  feature: FeatureRequestSdkBase;
  state: StateRequestSdkBase;
}

/**
 * Base fe→be **get** request: the target `session_id` + an optional `state` re-seed. **No auth,
 * no portal** — get returns a live workflow only; a live-miss 404s and the fe-package re-invokes
 * *create* with the id (create owns resume). Subclassed per workflow to type `state`.
 */
export interface GetRequestSdkBase {
  session_id: string;
  state?: StateRequestSdkBase;
}

/**
 * fe→be **delete** request: just the target `session_id` (auth-less; be settles on delete).
 * Shared across workflows — no per-workflow payload.
 */
export interface DeleteRequestSdk {
  session_id: string;
}

// --- Answer (be → fe): the `data` object {session_id, connection, quota} ----

/**
 * Base `connection` answer scope: the be-minted connection info (every workflow has a lifeline
 * URL). Subclassed per workflow to add its audio / results URLs + audio format. Replaces the
 * portal's provider `workflow` scope on the fe boundary — the SDK receives only where to connect.
 */
export interface ConnectionResponseSdkBase {
  lifeline_ws_url: string;
}

/**
 * `quota` answer scope (workflow-independent): the live budget + the binding layer's absolute
 * limit + per-unit translation, passed through from the portal.
 */
export interface QuotaResponseSdk {
  /** Remaining budget in units (the live ceiling). */
  effective_quota_budget?: string | null;
  /** Absolute configured limit of the binding layer (units). */
  effective_quota_limit?: string | null;
  /** Name of the binding quota layer (or null). */
  limiting_quota_entity?: string | null;
  /** `{ adapter_config_key: { meter_unit: units_per_unit } }` for live tracking. */
  unit_translation: Record<string, Record<string, string>>;
}

/**
 * Base top-level be→fe answer data object: `{ session_id, connection, quota }`. Subclassed per
 * workflow to narrow `connection`. The transport unwraps it out of `SuccessEnvelope`.
 */
export interface ResolveResponseSdkBase {
  session_id: string;
  connection: ConnectionResponseSdkBase;
  quota: QuotaResponseSdk;
}
