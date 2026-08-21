/**
 * Constants shared with the Speechineer API contract.
 */

/**
 * Where the SDK sends its requests unless `createClient({ baseUrl })` says
 * otherwise — the production Speechineer API.
 *
 * @group Setup
 */
export const DEFAULT_BASE_URL = 'https://ai.speechineer.com/api';

/**
 * The version of the Speechineer API this SDK speaks. It lives here, not in the
 * `baseUrl` a consumer configures: the wire version belongs to the contract, so the
 * SDK pins it and an upgrade is a package upgrade. The service serves older versions
 * alongside the current one, so an app on an older SDK keeps working.
 *
 * @internal
 */
export const API_VERSION = 'v1';

/**
 * Route table (paths under the client's `baseUrl`) — the single source of every
 * endpoint segment, grouped per workflow. Each workflow has its `root` (built from
 * {@link API_VERSION}) plus an `endpoints` map of segments under it; callers join
 * them: `` `${root}/${endpoints.x}` ``.
 *
 * @internal
 */
export const ROUTES = {
  speechToForm: {
    root: `/${API_VERSION}/workflows/speech-to-form`,
    endpoints: {
      createPortal: 'create-portal',
      createStandalone: 'create-standalone',
      get: 'get',
      delete: 'delete',
    },
  },
  speechToFormWithTranscription: {
    root: `/${API_VERSION}/workflows/speech-to-form-with-transcription`,
    endpoints: {
      createPortal: 'create-portal',
      createStandalone: 'create-standalone',
      get: 'get',
      delete: 'delete',
    },
  },
  textToForm: {
    root: `/${API_VERSION}/workflows/text-to-form`,
    endpoints: {
      createPortal: 'create-portal',
      createStandalone: 'create-standalone',
      get: 'get',
      delete: 'delete',
      extract: 'extract',
    },
  },
} as const;

/**
 * @internal
 */
export const WORKFLOW_NOT_FOUND_CLOSE_CODE = 4404;

/**
 * Crash close codes the service uses on the session connection (and on a late
 * audio/results connection to an already-crashed workflow). The typed
 * crash signal is delivered as a message *before* the close, so consumers
 * react via `onError`, not via these codes.
 *
 * @internal
 */
export const CRASH_CLOSE_CODES = {
  PROVIDER_CRASH: 4501,
  ADAPTER_CRASH: 4502,
  PRODUCER_CRASH: 4503,
  CONSUMER_CRASH: 4504,
  WORKFLOW_CRASH: 4505,
} as const;

/**
 * @internal
 */
export function isCrashCloseCode(code: number): boolean {
  return code >= 4501 && code <= 4505;
}

/**
 * @internal
 */
export type OnWorkflowNotFoundCallback = () => void;
