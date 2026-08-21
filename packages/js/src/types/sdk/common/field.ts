/**
 * Field model — mirrors the Speechineer API's field schema.
 *
 * A `FieldSpec` is a PURE definition (no value); a field's value travels
 * separately as a `FieldValue` (in `feature.state.field_values`).
 */

/**
 * @group Fields
 */
export type FieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'url'
  | 'integer'
  | 'float'
  | 'slider'
  | 'checkbox'
  | 'select'
  | 'multiselect'
  | 'date'
  | 'time'
  | 'datetime'
  // Reserved for a future structured type (dict on the wire) — not yet supported by
  // frontends; `FormField` deliberately has no factory for it.
  | 'template';

/** Type configuration for `select` / `multiselect` fields. */
export interface OptionsConfig {
  kind: 'options';
  options: string[];
  /** When true, the options list is appended to the field prompt sent to the LLM. */
  append_options_to_prompt?: boolean;
}

/** Type configuration for `slider` / ranged numeric fields: `[min, max]`. */
export interface RangeConfig {
  kind: 'range';
  range: [number, number];
}

/** Discriminated (`kind`) config for fields that need one. */
export type FieldTypeConfig = OptionsConfig | RangeConfig;

/**
 * A field identifier paired with its value — the ONLY carrier of a value.
 * Lives in `feature.state.field_values` on the create envelope; never on a
 * `FieldSpec`.
 */
export interface FieldValue {
  field_id: string;
  value: unknown;
}

/** Pure specification of a field to extract (definition only — no value). */
export interface FieldSpec {
  field_id: string;
  prompt: string;
  type: FieldType;
  field_configuration?: FieldTypeConfig | null;
}
