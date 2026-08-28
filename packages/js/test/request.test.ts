/**
 * Options → wire request: the `form.source` switch (workspace vs inline), the customer slot
 * names mapped to the service's keys, the spoken-language fan-out, initial values, the
 * resume target, and the field-spec conversion.
 */

import { describe, expect, it } from 'vitest';
import { toSdkFieldSpec, toSdkFieldValues, toSdkModels, toSdkPrompts } from '../src/convert/outbound/common/field.js';
import { toSpeechToFormGetRequestSdk, toSpeechToFormResolveRequestSdk } from '../src/convert/outbound/workflows/speech-to-form.js';
import { toSpeechToFormWithTranscriptionResolveRequestSdk } from '../src/convert/outbound/workflows/speech-to-form-with-transcription.js';
import { toTextToFormResolveRequestSdk } from '../src/convert/outbound/workflows/text-to-form.js';
import { FormField, FormFieldConfig } from '../src/features/forms/form-field.js';

const workspace = { source: 'workspace', key: 'intake', version: '1', language: 'en' } as const;
const inline = {
  source: 'inline',
  key: 'intake',
  version: '1',
  language: 'en',
  fields: [FormField.text('name', 'Extract the name'), FormField.select('species', 'Extract the species', ['Dog', 'Cat'])],
  prompts: { extraction: 'Be precise.' },
  models: { transcription: 'fast-de' },
} as const;

describe('toSpeechToFormResolveRequestSdk', () => {
  it('workspace form: identity only — no fields, prompts, or model pins', () => {
    const req = toSpeechToFormResolveRequestSdk({ form: workspace }, 'AUTH');
    expect(req).toEqual({
      auth: 'AUTH',
      workflow: { workflow_key: 'speech_to_form' },
      feature: { form_key: 'intake', form_version_key: '1', form_config_language: 'en' },
      state: {},
    });
  });

  it('workspace form: fieldConfigs reach the wire as feature.fields', () => {
    const req = toSpeechToFormResolveRequestSdk(
      { form: { ...workspace, fieldConfigs: [FormFieldConfig.select('species', ['Dog', 'Cat'])] } },
      'AUTH',
    );
    expect(req.feature).toEqual({
      form_key: 'intake',
      form_version_key: '1',
      form_config_language: 'en',
      fields: [
        {
          field_id: 'species',
          prompt: '',
          type: 'select',
          field_configuration: { kind: 'options', options: ['Dog', 'Cat'] },
        },
      ],
    });
    // Still a workspace form: no model pins ride along with it.
    expect(req.workflow).toEqual({ workflow_key: 'speech_to_form' });
  });

  it('inline form: fields converted, prompts and models mapped to the service slot keys', () => {
    const req = toSpeechToFormResolveRequestSdk({ form: inline }, 'AUTH');
    expect(req.workflow).toEqual({
      workflow_key: 'speech_to_form',
      adapter_config_keys: { transcription: 'fast-de' },
    });
    expect(req.feature).toEqual({
      form_key: 'intake',
      form_version_key: '1',
      form_config_language: 'en',
      system_prompts: { form_data_extraction: 'Be precise.' },
      fields: [
        { field_id: 'name', prompt: 'Extract the name', type: 'text' },
        {
          field_id: 'species',
          prompt: 'Extract the species',
          type: 'select',
          field_configuration: { kind: 'options', options: ['Dog', 'Cat'] },
        },
      ],
    });
  });

  it('spokenLanguage fans out to feature.spoken_language and state.transcription_language', () => {
    const req = toSpeechToFormResolveRequestSdk({ form: workspace, spokenLanguage: 'de' }, 'AUTH');
    expect(req.feature.spoken_language).toBe('de');
    expect(req.state.transcription_language).toBe('de');
  });

  it('initialValues become state.field_values; the resume target is the top-level session_id', () => {
    const req = toSpeechToFormResolveRequestSdk({ form: workspace, initialValues: { age: 41, name: 'Ada' } }, 'AUTH', 'old-1');
    expect(req.session_id).toBe('old-1');
    expect(req.state.field_values).toEqual([
      { field_id: 'age', value: 41 },
      { field_id: 'name', value: 'Ada' },
    ]);
  });

  it('the get re-seed carries the id and the restorable state only', () => {
    expect(toSpeechToFormGetRequestSdk({ form: workspace, spokenLanguage: 'de', initialValues: { a: 1 } }, 'sess-1')).toEqual({
      session_id: 'sess-1',
      state: { field_values: [{ field_id: 'a', value: 1 }], transcription_language: 'de' },
    });
  });
});

describe('the other builders', () => {
  it('with-transcription uses its own workflow key and the same scopes', () => {
    const req = toSpeechToFormWithTranscriptionResolveRequestSdk({ form: inline, spokenLanguage: 'de' }, 'AUTH');
    expect(req.workflow.workflow_key).toBe('speech_to_form_with_transcription');
    expect(req.workflow.adapter_config_keys).toEqual({ transcription: 'fast-de' });
    expect(req.feature.fields).toHaveLength(2);
    expect(req.state.transcription_language).toBe('de');
  });

  it('text-to-form has no spoken language and keeps the form switch', () => {
    const req = toTextToFormResolveRequestSdk({ form: inline, initialValues: { a: 1 } }, 'AUTH');
    expect(req.workflow.workflow_key).toBe('text_to_form');
    expect(req.feature.fields).toHaveLength(2);
    expect(req.feature.system_prompts).toEqual({ form_data_extraction: 'Be precise.' });
    expect(req.state).toEqual({ field_values: [{ field_id: 'a', value: 1 }] });
    expect(toTextToFormResolveRequestSdk({ form: workspace }, 'AUTH').feature).toEqual({
      form_key: 'intake',
      form_version_key: '1',
      form_config_language: 'en',
    });
  });
});

describe('field + slot conversion', () => {
  it('toSdkFieldSpec: id → field_id, config → field_configuration (options with appendOptionsToPrompt, range)', () => {
    expect(toSdkFieldSpec(FormField.select('s', 'p', ['a'], true))).toEqual({
      field_id: 's',
      prompt: 'p',
      type: 'select',
      field_configuration: { kind: 'options', options: ['a'], append_options_to_prompt: true },
    });
    expect(toSdkFieldSpec(FormField.slider('pain', 'p', [0, 10]))).toEqual({
      field_id: 'pain',
      prompt: 'p',
      type: 'slider',
      field_configuration: { kind: 'range', range: [0, 10] },
    });
  });

  it('prompts / models map only the slots that were given', () => {
    expect(toSdkPrompts({ transcription: 't' })).toEqual({ transcription: 't' });
    expect(toSdkPrompts({ extraction: 'e' })).toEqual({ form_data_extraction: 'e' });
    expect(toSdkModels({ transcription: 'a', extraction: 'b' })).toEqual({ transcription: 'a', form_data_extraction: 'b' });
    expect(toSdkModels({})).toEqual({});
    expect(toSdkFieldValues({})).toEqual([]);
  });

  it('FormField validates config-bearing types', () => {
    expect(() => FormField.select('s', 'p', [])).toThrow("FormField.select: at least one option is required (field 's')");
    expect(() => FormField.slider('s', 'p', [5, 1])).toThrow('min must be < max');
  });
});
