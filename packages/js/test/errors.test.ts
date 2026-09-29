/**
 * Every failure a developer can observe is one `SpeechineerError` carrying the code and
 * category Speechineer named — whether it arrived as a rejected request, as a session that
 * stopped mid-run, or from the browser itself.
 *
 * What these pin is the projection: `Problem.type` picks the class, and `instanceof` therefore
 * answers "which kind of failure is this" without a caller ever comparing strings. Before
 * FLY-492 the code was derived from a Python class name, so a vendor library's
 * `ConnectionClosedError` reached an integrator's catch block as the error code.
 */

import { describe, expect, it } from 'vitest';
import { fromProblem } from '../src/convert/inbound/common/problem.js';
import {
  SpeechineerAuthError,
  SpeechineerError,
  SpeechineerQuotaError,
  SpeechineerRuntimeError,
  SpeechineerSessionEndedError,
  SpeechineerUnavailableError,
  toSpeechineerError,
} from '../src/errors/index.js';
import {
  closeCodeFor,
  isTerminalCloseCode,
  PROBLEM_TYPES,
  STATUS_BY_TYPE,
} from '../src/types/sdk/common/problem.js';

function domError(name: string): Error {
  const e = new Error(name);
  e.name = name;
  return e;
}

describe('fromProblem', () => {
  it.each([
    ['auth', SpeechineerAuthError],
    ['quota', SpeechineerQuotaError],
    ['runtime', SpeechineerRuntimeError],
    ['gone', SpeechineerSessionEndedError],
    ['unavailable', SpeechineerUnavailableError],
  ])('a %s failure is a %s', (type, Expected) => {
    const err = fromProblem({ code: 'SOMETHING', type, message: 'went wrong' });

    expect(err).toBeInstanceOf(Expected);
    expect(err).toBeInstanceOf(SpeechineerError);
    expect(err.type).toBe(type);
    expect(err.code).toBe('SOMETHING');
  });

  // The sweep behind the table above: the named pairs say WHICH class, this says none is
  // missing. A category is only useful if catching its class is a thing a caller can do, so
  // "every category has one, and no two share one" is the property — not the contents of a
  // lookup table, which a test asserting the table back would only restate.
  it('gives every category a class of its own', () => {
    const constructors = PROBLEM_TYPES.map(
      (type) => fromProblem({ code: 'SOMETHING', type, message: 'went wrong' }).constructor,
    );

    for (const [i, type] of PROBLEM_TYPES.entries()) {
      expect(constructors[i], `${type} has no class of its own`).not.toBe(SpeechineerError);
      expect((constructors[i] as typeof SpeechineerError).type).toBe(type);
    }
    expect(new Set(constructors).size).toBe(PROBLEM_TYPES.length);
  });

  // Statuses are what the close codes derive from, so a category whose status is wrong closes
  // a connection with a number that means something else.
  it.each(PROBLEM_TYPES)('closes a %s connection with 4000 + its status', (type) => {
    expect(closeCodeFor(type)).toBe(4000 + STATUS_BY_TYPE[type]);
    expect(isTerminalCloseCode(closeCodeFor(type))).toBe(true);
  });

  it('carries the data the failure came with, unchanged', () => {
    const err = fromProblem(
      {
        code: 'ACCOUNT_QUOTA_EXCEEDED',
        type: 'quota',
        message: 'The allowance is used up.',
        meta: { limit: '1000', used: '1000', remaining: '0', layer: 'account:month' },
      },
      { requestId: 'req-42' },
    );

    expect(err).toBeInstanceOf(SpeechineerQuotaError);
    expect(err.meta).toEqual({ limit: '1000', used: '1000', remaining: '0', layer: 'account:month' });
    expect(err.requestId).toBe('req-42');
  });

  it('breaks an aggregated failure into one detail per cause', () => {
    const err = fromProblem({
      code: 'SESSION_ENDED',
      type: 'gone',
      message: 'This session has ended.',
      details: [{ code: 'EXTRACTION_FAILED', message: 'Reading values stopped.' }],
    });

    expect(err).toBeInstanceOf(SpeechineerSessionEndedError);
    // The situation is stable, the cause is specific — a caller branches on the first and
    // reports the second (FLY-495).
    expect(err.details.map((d) => d.code)).toEqual(['EXTRACTION_FAILED']);
  });

  it('falls back to the base class for a category this build has never heard of', () => {
    // A newer service naming a category must never break an older app's error handling.
    const err = fromProblem({ code: 'SOMETHING_NEW', type: 'teleportation', message: 'hm' });

    expect(err).toBeInstanceOf(SpeechineerError);
    expect(err.type).toBe('teleportation');
  });

  it('matches instanceof across two copies of the package', () => {
    // The brand, not the prototype chain: a transitive dependency pinning a different version
    // of this package would otherwise make every `instanceof` silently false.
    const fromAnotherBundle = {
      __speechineer: true,
      type: 'quota',
      code: 'ACCOUNT_QUOTA_EXCEEDED',
    };

    expect(fromAnotherBundle).toBeInstanceOf(SpeechineerQuotaError);
    expect(fromAnotherBundle).toBeInstanceOf(SpeechineerError);
    expect(fromAnotherBundle).not.toBeInstanceOf(SpeechineerAuthError);
  });
});

describe('toSpeechineerError', () => {
  it('passes an already-converted failure through unchanged', () => {
    // No re-classification on the way past: the category Speechineer gave it survives however
    // many frames it propagates through, which is why there is no `phase` to stamp any more.
    const e = fromProblem({ code: 'ACCOUNT_QUOTA_EXCEEDED', type: 'quota', message: 'spent' });

    expect(toSpeechineerError(e)).toBe(e);
  });

  it.each([
    [domError('NotAllowedError'), 'MICROPHONE_DENIED', 'Microphone access was denied.'],
    [domError('NotFoundError'), 'MICROPHONE_UNAVAILABLE', 'No usable microphone was found.'],
    [new Error('Audio config required: …'), 'AUDIO_UNSUPPORTED', 'Audio config required: …'],
    [new Error('whatever'), 'UNKNOWN', 'whatever'],
    ['a string', 'UNKNOWN', 'a string'],
  ])('maps %o to %s', (input, code, message) => {
    const err = toSpeechineerError(input);

    expect(err).toBeInstanceOf(SpeechineerError);
    expect(err.code).toBe(code);
    expect(err.message).toBe(message);
    // The SDK's own failures: the app's doing, caught before anything was sent.
    expect(err.type).toBe('client');
    expect(err.cause).toBe(input);
  });
});
