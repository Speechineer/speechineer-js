/**
 * The forms feature slice — the dev-facing vocabulary of form filling: where the form
 * comes from (`FormDefinition`), what to extract (`FieldSpec`, built with `FormField`).
 * `isInlineForm` stays internal (path import only).
 */

export type { FieldConfig, FieldSpec, FieldType, OptionsFieldConfig, RangeFieldConfig } from './fields.js';
export type { FieldFactory } from './form-field.js';
export { FIELD_TYPES, FormField } from './form-field.js';
export type { FormDefinition, FormIdentity, InlineForm, Models, Prompts, WorkspaceForm } from './identity.js';
