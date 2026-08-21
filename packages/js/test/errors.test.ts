/**
 * Every failure a developer can observe is one `SpeechineerError` with a stable code:
 * transport errors, not-found, microphone problems, the service's runtime failures.
 */

import { describe, expect, it } from 'vitest';
import { RequestError, WorkflowNotFoundError } from '../src/api/workflows/_post.js';
import { fromCrashSignal, SpeechineerError, toSpeechineerError } from '../src/errors.js';

function domError(name: string): Error {
  const e = new Error(name);
  e.name = name;
  return e;
}

describe('toSpeechineerError', () => {
  it('passes a SpeechineerError through unchanged', () => {
    const e = new SpeechineerError('x', { code: 'X', phase: 'action', recoverable: true });
    expect(toSpeechineerError(e, 'start')).toBe(e);
  });

  it.each([
    [new WorkflowNotFoundError('gone'), 'NOT_FOUND', 'gone'],
    [new RequestError('rejected', 403, 'FEATURE_NOT_AVAILABLE'), 'FEATURE_NOT_AVAILABLE', 'rejected'],
    [new RequestError('bad', 500, null), 'REQUEST_FAILED', 'bad'],
    [new RequestError('down', 0, 'NETWORK'), 'NETWORK', 'down'],
    [domError('NotAllowedError'), 'MICROPHONE_DENIED', 'Microphone access was denied.'],
    [domError('NotFoundError'), 'MICROPHONE_UNAVAILABLE', 'No usable microphone was found.'],
    [new Error('Audio config required: …'), 'AUDIO_UNSUPPORTED', 'Audio config required: …'],
    [new Error('whatever'), 'UNKNOWN', 'whatever'],
    ['a string', 'UNKNOWN', 'a string'],
  ])('maps %o to %s', (input, code, message) => {
    const err = toSpeechineerError(input, 'start');
    expect(err).toBeInstanceOf(SpeechineerError);
    expect(err.code).toBe(code);
    expect(err.message).toBe(message);
    expect(err.phase).toBe('start');
    expect(err.recoverable).toBe(true);
    expect(err.cause).toBe(input);
  });

  it('is non-recoverable in the runtime phase', () => {
    expect(toSpeechineerError(new Error('x'), 'runtime').recoverable).toBe(false);
  });
});

describe('fromCrashSignal', () => {
  it('carries the service error code, the detail, and is never recoverable', () => {
    const err = fromCrashSignal({
      type: 'crash',
      verbosity: 'error',
      source: 'workflow',
      payload: { level: 'provider', error_code: 'PROVIDER_TIMEOUT', message: 'Timed out', detail: 'after 30 s' },
      session_id: 's',
      timestamp: 't',
    });
    expect(err).toMatchObject({
      code: 'PROVIDER_TIMEOUT',
      phase: 'runtime',
      recoverable: false,
      detail: 'after 30 s',
      message: 'Timed out: after 30 s',
    });
    expect(err.name).toBe('SpeechineerError');
  });

  it('omits the detail from the message when there is none', () => {
    const err = fromCrashSignal({
      type: 'crash',
      verbosity: 'error',
      source: 'workflow',
      payload: { level: 'workflow', error_code: 'X', message: 'kaput', detail: null },
      session_id: 's',
      timestamp: 't',
    });
    expect(err.message).toBe('kaput');
    expect(err.detail).toBeNull();
  });
});
