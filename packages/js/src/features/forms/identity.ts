/**
 * The form definition — the dev-facing concept behind the wire `feature` request scope
 * (`FeatureRequestSdkBase` in `types/sdk/workflows/base.ts`). `form.source` decides which
 * create route the session uses: a workspace form resolves through `create-portal` (the
 * portal owns the definition), an inline form through `create-standalone` (the code owns
 * it; the portal records it as a read-only form under the same key/version).
 * `convert/outbound` maps these into the request's `feature` + `workflow` scopes.
 */

import type { FieldSpec } from './fields.js';

/**
 * The identity every form carries, whichever side defines it.
 *
 * @group Forms
 */
export interface FormIdentity {
  /**
   * The form's key. For a workspace form: the key shown in Speechineer. For an
   * inline form: your own stable identifier — Speechineer records the form under it
   * so usage is attributed and limited like any other form.
   */
  key: string;
  /**
   * Which version of that form. Pin it: your integration keeps working while a new
   * version is drafted, and you move over when ready.
   */
  version: string;
  /**
   * The language of the form definition itself — the field labels and prompts
   * (for example `'en'`, `'de'`). Independent of the language the user speaks.
   */
  language: string;
}

/**
 * A form configured in Speechineer. Your code only names it; the fields, prompts,
 * and models come from your workspace — change them there without shipping a release.
 *
 * @group Forms
 */
export interface WorkspaceForm extends FormIdentity {
  /** The definition lives in your Speechineer workspace. */
  source: 'workspace';
}

/**
 * The prompts an inline form supplies, one per slot: how to transcribe, and how to
 * extract the field values. Each is plain-language instruction text. Omit a slot to
 * use the default.
 *
 * @group Forms
 */
export interface Prompts {
  /** Guidance for the transcription step (vocabulary, domain, style). */
  transcription?: string;
  /** Guidance for turning the transcript into field values. */
  extraction?: string;
}

/**
 * The model configurations an inline form pins, one per slot, by the keys you gave
 * them in your workspace. Omit a slot to use the workspace default.
 *
 * @group Forms
 */
export interface Models {
  /** The model configuration key for transcription. */
  transcription?: string;
  /** The model configuration key for extraction. */
  extraction?: string;
}

/**
 * A form defined in your code: you declare the fields to extract (build them with
 * `FormField`) and, optionally, the prompts and model configurations to use.
 * Speechineer records it under `key` / `version` in your workspace.
 *
 * @group Forms
 */
export interface InlineForm extends FormIdentity {
  /** The definition lives in your code. */
  source: 'inline';
  /** Fields to extract — build with `FormField`. */
  fields: FieldSpec[];
  /** Custom prompts per slot. */
  prompts?: Prompts;
  /** Model configurations per slot, by workspace key. */
  models?: Models;
}

/**
 * Where the form comes from: the one configured in Speechineer (`source: 'workspace'`)
 * or the one your code defines (`source: 'inline'`). Every capability that fills a
 * form takes one of these as `form`.
 *
 * @group Forms
 */
export type FormDefinition = WorkspaceForm | InlineForm;

/** @internal */
export function isInlineForm(form: FormDefinition): form is InlineForm {
  return form.source === 'inline';
}
