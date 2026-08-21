/**
 * Dev-facing camelCase field types. `FieldSpec` is what `FormField` produces;
 * `convert/outbound` maps it to the wire `FieldSpec` (snake_case). `FieldType` is a plain
 * value union (no case difference) reused from the wire.
 */

import type { FieldType } from '../../types/sdk/common/field.js';

export type { FieldType };

/**
 * The allowed options of a choice field (`select` / `multiselect`).
 *
 * @group Fields
 */
export interface OptionsFieldConfig {
  /** Marks the options configuration. */
  kind: 'options';
  /** The values the user may choose from. */
  options: string[];
  /** Append the options to the prompt so the extraction sees them as part of the instruction. */
  appendOptionsToPrompt?: boolean;
}

/**
 * The `[min, max]` range of a slider field.
 *
 * @group Fields
 */
export interface RangeFieldConfig {
  /** Marks the range configuration. */
  kind: 'range';
  /** The lowest and highest value allowed. */
  range: [number, number];
}

/**
 * The extra configuration a field type may carry: the allowed options of a
 * choice field, or the range of a slider.
 *
 * @group Fields
 */
export type FieldConfig = OptionsFieldConfig | RangeFieldConfig;

/**
 * One field to extract. Build these with `FormField` rather than by hand —
 * the factory picks the right type and validates the options for you.
 *
 * @group Fields
 */
export interface FieldSpec {
  /** Your id for the field. It comes back with every value — in `values` and in `onFieldValue`. */
  id: string;
  /**
   * What to extract, in plain language — "Extract the patient's full name".
   * This instruction is what makes the difference between a good and a poor
   * result, so be specific about the value you want.
   */
  prompt: string;
  /** The kind of value expected, which also shapes how it is normalized. */
  type: FieldType;
  /** Extra rules for types that need them: the options of a choice, or a slider range. */
  config?: FieldConfig;
}
