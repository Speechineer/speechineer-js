/**
 * Tools — browser-side capabilities a workflow's hook wires in on demand (only if
 * its workflow needs them). Each tool is one module here; add a sibling (e.g.
 * `tools/camera/`) for a new capability. A tool is not per-workflow config — it's a
 * reusable device capability paired with a transport, composed by the hooks that need it.
 */

export * from './audio/index.js';
