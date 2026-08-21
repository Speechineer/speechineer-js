/**
 * Inbound action-result conversion for text_to_form: the wire snake_case extract return
 * (`{ fields: [{ field_id, value }] }`) → the dev values record keyed by field id.
 */

import type { FormDataExtractionResult } from '../../../types/sdk/common/form-data-extraction.js';

export function fromFormDataResult(r: FormDataExtractionResult): Readonly<Record<string, unknown>> {
  const values: Record<string, unknown> = {};
  for (const f of r.fields) values[f.field_id] = f.value;
  return values;
}
