/**
 * The configuration and data types every Speechineer package shares. Whichever
 * package you install, these are the same: how you configure the client, how you
 * describe the form to fill, the callbacks that deliver values and progress, the
 * errors and events that report problems, and the state every session reports.
 *
 * The package for your framework documents its own functions; everything those
 * functions' options are built from is described here, once.
 *
 * @module
 *
 * @groupDescription Setup
 * Create the client once, at app startup, with your credentials — every session
 * starts from it. Without a `baseUrl` it talks to the production Speechineer API.
 *
 * @groupDescription Authentication
 * Who is calling: your workspace's API key plus an identifier for the end user, or
 * a token your server signed (a string, or a function that fetches a fresh one).
 *
 * @groupDescription Forms
 * Which form to fill and where its definition lives: configured in Speechineer
 * (a workspace form — your code names it) or defined in your code (an inline form —
 * fields, prompts, and model configurations ship with the call).
 *
 * @groupDescription Fields
 * What to extract and how to describe it. Build each field of an inline form with
 * `FormField`; the prompt is the instruction Speechineer follows for that field.
 *
 * @groupDescription Callbacks
 * Optional hooks for imperative integrations. Everything they report — values, the
 * transcript, events, errors — is also in the session state.
 *
 * @groupDescription Events and errors
 * What you receive when something noteworthy or fatal happens during a session: a
 * typed error with a stable code, and the stream of status events.
 *
 * @groupDescription Session state
 * What a running session reports about itself — its lifecycle, its id, the last
 * error, the latest values, the transcript, whether it is listening, and whether each
 * of its connections is open. The same shape in every framework: read it, subscribe
 * to it, render from it.
 */

// Contributor note (never rendered): this file is the shared "Core" reference — the docs
// build reads it (packages/js/typedoc.json). It lists only symbols shared by every
// framework package; the capability functions and their option/session types belong in
// the per-package docs-entry files. Not part of the tsup build graph.

export type {
  Account,
  ClientOptions,
  ConnectionKey,
  ConnectionState,
  ConnectionStatus,
  ErrorPhase,
  EventLevel,
  FieldConfig,
  FieldFactory,
  FieldSpec,
  FieldType,
  FormDefinition,
  FormIdentity,
  FormValueCallbacks,
  InlineForm,
  Models,
  OptionsFieldConfig,
  Prompts,
  RangeFieldConfig,
  SessionCallbacks,
  SessionConnections,
  SessionEvent,
  SessionState,
  SessionStatus,
  SpeechineerClient,
  TokenProvider,
  TranscriptCallbacks,
  WorkspaceForm,
} from './index.js';
export { createClient, DEFAULT_BASE_URL, FIELD_TYPES, FormField, SpeechineerError } from './index.js';
