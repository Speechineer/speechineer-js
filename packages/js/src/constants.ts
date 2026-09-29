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

// Close codes are NOT constants here. They are derived from the failure's own category —
// `closeCodeFor` / `isTerminalCloseCode` in `types/sdk/common/problem.ts`,
// mirroring the service's own projection — so the catalogue of failures stays the only list
// anyone maintains.

/**
 * @internal
 */
export type OnWorkflowNotFoundCallback = () => void;
