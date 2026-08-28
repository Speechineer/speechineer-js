/**
 * Shared scope assembly for the form capabilities' create / get requests. `form.source`
 * decides what the `feature` / `workflow` scopes carry: an inline form ships its `fields`,
 * prompts and model pins; a workspace form ships its identity, plus `fieldConfigs` when it
 * fills slots the workspace marked as code-defined. Both field lists leave through the same
 * `feature.fields` key. `spokenLanguage` fans out to both `feature.spoken_language` (the portal
 * reads it as a resolve input) and `state.transcription_language` (the service reads it at
 * runtime) — the portal never echoes it back, so the service needs it sent directly.
 *
 * @internal
 */

import { type FormDefinition, isInlineForm } from '../../../features/forms/identity.js';
import type { FieldSpec, FieldValue } from '../../../types/sdk/common/field.js';
import { toSdkFieldSpec, toSdkFieldValues, toSdkModels, toSdkPrompts } from '../common/field.js';

/** The `workflow` request scope: the key + the inline form's model pins. */
export function toWorkflowScope<K extends string>(
  workflowKey: K,
  form: FormDefinition,
): { workflow_key: K; adapter_config_keys?: Record<string, string> } {
  const models = isInlineForm(form) && form.models ? toSdkModels(form.models) : null;
  return {
    workflow_key: workflowKey,
    ...(models && Object.keys(models).length > 0 ? { adapter_config_keys: models } : {}),
  };
}

/** The `feature` request scope: identity (+ spoken language hint, + the inline form's fields and prompts). */
export function toFeatureScope(
  form: FormDefinition,
  spokenLanguage?: string,
): {
  form_key: string;
  form_version_key: string;
  form_config_language: string;
  spoken_language?: string;
  system_prompts?: Record<string, string>;
  fields?: FieldSpec[];
} {
  const prompts = isInlineForm(form) && form.prompts ? toSdkPrompts(form.prompts) : null;
  return {
    form_key: form.key,
    form_version_key: form.version,
    form_config_language: form.language,
    ...(spokenLanguage ? { spoken_language: spokenLanguage } : {}),
    // Both sources land in the same wire slot but mean different things, which is why they are
    // named apart on the way in: an inline form's `fields` IS the definition, a workspace
    // form's `fieldConfigs` only fills the slots the workspace left open for code.
    ...(isInlineForm(form)
      ? { fields: form.fields.map(toSdkFieldSpec) }
      : form.fieldConfigs?.length
        ? { fields: form.fieldConfigs.map(toSdkFieldSpec) }
        : {}),
    ...(prompts && Object.keys(prompts).length > 0 ? { system_prompts: prompts } : {}),
  };
}

/** The top-level `state` request scope: restorable values (+ the runtime spoken-language hint). */
export function toStateScope(
  initialValues?: Readonly<Record<string, unknown>>,
  spokenLanguage?: string,
): { field_values?: FieldValue[]; transcription_language?: string } {
  return {
    ...(initialValues && Object.keys(initialValues).length > 0
      ? { field_values: toSdkFieldValues(initialValues) }
      : {}),
    ...(spokenLanguage ? { transcription_language: spokenLanguage } : {}),
  };
}
