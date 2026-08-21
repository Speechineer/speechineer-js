/**
 * Field inputs — factory helpers that build validated camelCase `FieldSpec`s (dev-facing).
 * `convert/outbound` maps them to the wire `FieldSpec` on send. Part of the forms feature
 * slice; another feature class adds its own factories in its slice. `FormField` is the one
 * input helper an app developer imports.
 */

import type { FieldConfig, FieldSpec, FieldType } from './fields.js';

/**
 * The field types you can declare, in presentation order. Use it to build a
 * type picker without redeclaring the list.
 *
 * @group Fields
 */
export const FIELD_TYPES = [
  'text',
  'textarea',
  'email',
  'phone',
  'url',
  'integer',
  'float',
  'slider',
  'checkbox',
  'select',
  'multiselect',
  'date',
  'time',
  'datetime',
] as const satisfies readonly FieldType[];

/**
 * The field factory surface. Every helper returns a ready `FieldSpec`.
 *
 * @group Fields
 */
export interface FieldFactory {
  /** Free-form text. */
  text(id: string, prompt: string): FieldSpec;
  /** Multi-line free-form text; same value semantics as `text`. */
  textarea(id: string, prompt: string): FieldSpec;
  /** An email address. */
  email(id: string, prompt: string): FieldSpec;
  /** A phone number. */
  phone(id: string, prompt: string): FieldSpec;
  /** A URL. */
  url(id: string, prompt: string): FieldSpec;
  /** A whole number. */
  integer(id: string, prompt: string): FieldSpec;
  /** A decimal number. */
  float(id: string, prompt: string): FieldSpec;
  /** A yes/no value. */
  checkbox(id: string, prompt: string): FieldSpec;
  /** A calendar date. */
  date(id: string, prompt: string): FieldSpec;
  /** A time of day. */
  time(id: string, prompt: string): FieldSpec;
  /** A date with a time. */
  datetime(id: string, prompt: string): FieldSpec;
  /** Ranged numeric field; `range` is `[min, max]` with `min < max`. */
  slider(id: string, prompt: string, range: [number, number]): FieldSpec;
  /** Single-choice; `options` must be non-empty. */
  select(id: string, prompt: string, options: string[], appendOptionsToPrompt?: boolean): FieldSpec;
  /** Multi-choice; `options` must be non-empty. */
  multiselect(id: string, prompt: string, options: string[], appendOptionsToPrompt?: boolean): FieldSpec;
}

function make(id: string, type: FieldType, prompt: string, config?: FieldConfig): FieldSpec {
  return config ? { id, prompt, type, config } : { id, prompt, type };
}

function withOptions(
  id: string,
  type: 'select' | 'multiselect',
  prompt: string,
  options: string[],
  appendOptionsToPrompt?: boolean,
): FieldSpec {
  if (!options || options.length === 0) {
    throw new Error(`FormField.${type}: at least one option is required (field '${id}')`);
  }
  return make(id, type, prompt, {
    kind: 'options',
    options,
    ...(appendOptionsToPrompt ? { appendOptionsToPrompt: true } : {}),
  });
}

/**
 * Build the fields of an inline form. A factory object (no `new`, tree-shakeable)
 * producing `FieldSpec`s, with light runtime validation for the config-bearing types.
 *
 * @example
 * ```ts
 * import { FormField } from "@speechineer/js"; // also exported by @speechineer/react and @speechineer/angular
 *
 * const fields = [
 *   FormField.text("patientName", "Extract the patient full name"),
 *   FormField.integer("age", "Extract the age in years"),
 *   FormField.select("species", "Extract the species", ["Canine", "Feline", "Equine"]),
 *   FormField.slider("painLevel", "Extract the pain level", [0, 10]),
 * ];
 * ```
 *
 * @group Fields
 */
export const FormField: FieldFactory = {
  text: (id, prompt) => make(id, 'text', prompt),
  textarea: (id, prompt) => make(id, 'textarea', prompt),
  email: (id, prompt) => make(id, 'email', prompt),
  phone: (id, prompt) => make(id, 'phone', prompt),
  url: (id, prompt) => make(id, 'url', prompt),
  integer: (id, prompt) => make(id, 'integer', prompt),
  float: (id, prompt) => make(id, 'float', prompt),
  checkbox: (id, prompt) => make(id, 'checkbox', prompt),
  date: (id, prompt) => make(id, 'date', prompt),
  time: (id, prompt) => make(id, 'time', prompt),
  datetime: (id, prompt) => make(id, 'datetime', prompt),
  slider: (id, prompt, range) => {
    if (!range || range.length !== 2) {
      throw new Error(`FormField.slider: range [min, max] required (field '${id}')`);
    }
    if (range[0] >= range[1]) {
      throw new Error(`FormField.slider: min must be < max (field '${id}')`);
    }
    return make(id, 'slider', prompt, { kind: 'range', range });
  },
  select: (id, prompt, options, appendOptionsToPrompt) =>
    withOptions(id, 'select', prompt, options, appendOptionsToPrompt),
  multiselect: (id, prompt, options, appendOptionsToPrompt) =>
    withOptions(id, 'multiselect', prompt, options, appendOptionsToPrompt),
};
