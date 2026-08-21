/**
 * Outbound form conversion: dev camelCase `FieldSpec` / values record / `Prompts` / `Models`
 * → the wire snake_case `FieldSpec` / `FieldValue[]` / `system_prompts` / `adapter_config_keys`.
 * The slot keys the customer sees (`transcription`, `extraction`) map to the service's
 * slot names here and nowhere else.
 */

import type { FieldSpec } from '../../../features/forms/fields.js';
import type { Models, Prompts } from '../../../features/forms/identity.js';
import type { FieldSpec as FieldSpecSdk, FieldValue } from '../../../types/sdk/common/field.js';

/** The customer-facing slot names → the service's slot keys (prompt slots and model-configuration slots alike). */
const SLOT_KEYS = {
  transcription: 'transcription',
  extraction: 'form_data_extraction',
} as const;

export function toSdkFieldSpec(field: FieldSpec): FieldSpecSdk {
  const config = field.config;
  const field_configuration = config
    ? config.kind === 'options'
      ? {
          kind: 'options' as const,
          options: config.options,
          ...(config.appendOptionsToPrompt ? { append_options_to_prompt: true } : {}),
        }
      : { kind: 'range' as const, range: config.range }
    : undefined;
  return field_configuration
    ? { field_id: field.id, prompt: field.prompt, type: field.type, field_configuration }
    : { field_id: field.id, prompt: field.prompt, type: field.type };
}

/** A values record → the wire list of `{ field_id, value }` pairs. */
export function toSdkFieldValues(values: Readonly<Record<string, unknown>>): FieldValue[] {
  return Object.entries(values).map(([field_id, value]) => ({ field_id, value }));
}

/** Customer prompt slots → the wire `system_prompts` map (only the slots that were given). */
export function toSdkPrompts(prompts: Prompts): Record<string, string> {
  const out: Record<string, string> = {};
  if (prompts.transcription !== undefined) out[SLOT_KEYS.transcription] = prompts.transcription;
  if (prompts.extraction !== undefined) out[SLOT_KEYS.extraction] = prompts.extraction;
  return out;
}

/** Customer model-configuration slots → the wire `adapter_config_keys` map (only the slots that were given). */
export function toSdkModels(models: Models): Record<string, string> {
  const out: Record<string, string> = {};
  if (models.transcription !== undefined) out[SLOT_KEYS.transcription] = models.transcription;
  if (models.extraction !== undefined) out[SLOT_KEYS.extraction] = models.extraction;
  return out;
}
