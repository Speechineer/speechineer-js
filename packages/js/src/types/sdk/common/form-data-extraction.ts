/**
 * Form-data extraction result — mirrors the Speechineer API's
 * form-data extraction schema.
 *
 * The shape streamed over the form-data WS (speech_to_form) and returned by the
 * text-refinement HTTP action (speech_to_template_and_form).
 */

import type { FieldValue } from './field.js';

export interface FormDataExtractionResult {
  /** Extracted values as field_id / value pairs. */
  fields: FieldValue[];
}
