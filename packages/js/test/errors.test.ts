/**
 * Every failure a developer can observe is one `SpeechineerError` carrying the code and
 * category Speechineer named — whether it arrived as a rejected request, as a session that
 * stopped mid-run, or from the browser itself.
 *
 * What these pin is the projection: an event's `type` picks the class, and `instanceof`
 * therefore answers "which kind of failure is this" without a caller ever comparing strings.
 * Before FLY-492 the code was derived from a Python class name, so a vendor library's
 * `ConnectionClosedError` reached an integrator's catch block as the error code.
 */

import { describe, expect, it } from 'vitest';
import { fromEvent } from '../src/convert/inbound/common/event.js';
import {
  SpeechineerAuthError,
  SpeechineerError,
  SpeechineerQuotaError,
  SpeechineerRuntimeError,
  SpeechineerServiceError,
  SpeechineerUnavailableError,
  toSpeechineerError,
} from '../src/errors/index.js';
import {
  closeCodeFor,
  isTerminalCloseCode,
  STATUS_BY_ERROR_TYPE,
  type ErrorTypeSdk,
} from '../src/types/sdk/common/event.js';

const ERROR_TYPES = Object.keys(STATUS_BY_ERROR_TYPE) as ErrorTypeSdk[];

function domError(name: string): Error {
  const e = new Error(name);
  e.name = name;
  return e;
}

describe('fromEvent', () => {
  it.each([
    ['auth', SpeechineerAuthError],
    ['quota', SpeechineerQuotaError],
    ['runtime', SpeechineerRuntimeError],
    ['service', SpeechineerServiceError],
    ['unavailable', SpeechineerUnavailableError],
  ])('a %s failure is a %s', (type, Expected) => {
    const err = fromEvent({ code: 'SOMETHING', type, message: 'went wrong' });

    expect(err).toBeInstanceOf(Expected);
    expect(err).toBeInstanceOf(SpeechineerError);
    expect(err.type).toBe(type);
    expect(err.code).toBe('SOMETHING');
    // An error IS an event, at the one terminal level.
    expect(err.level).toBe('error');
  });

  // The sweep behind the table above: the named pairs say WHICH class, this says none is
  // missing. A category is only useful if catching its class is a thing a caller can do, so
  // "every category has one, and no two share one" is the property — not the contents of a
  // lookup table, which a test asserting the table back would only restate.
  it('gives every category a class of its own', () => {
    const constructors = ERROR_TYPES.map(
      (type) => fromEvent({ code: 'SOMETHING', type, message: 'went wrong' }).constructor,
    );

    for (const [i, type] of ERROR_TYPES.entries()) {
      expect(constructors[i], `${type} has no class of its own`).not.toBe(SpeechineerError);
      expect((constructors[i] as typeof SpeechineerError).type).toBe(type);
    }
    expect(new Set(constructors).size).toBe(ERROR_TYPES.length);
  });

  // Statuses are what the close codes derive from, so a category whose status is wrong closes
  // a connection with a number that means something else.
  it.each(ERROR_TYPES)('closes a %s connection with 4000 + its status', (type) => {
    expect(closeCodeFor(type)).toBe(4000 + STATUS_BY_ERROR_TYPE[type]);
    expect(isTerminalCloseCode(closeCodeFor(type))).toBe(true);
  });

  it('carries the data the failure came with, unchanged', () => {
    const err = fromEvent({
      code: 'ACCOUNT_QUOTA_EXCEEDED',
      type: 'quota',
      message: 'This account has used 1000 of its 1000 units for this account:month.',
      user_message: 'Das Guthaben ist aufgebraucht.',
      meta: { limit: '1000', used: '1000', remaining: '0', layer: 'account:month' },
    });

    expect(err).toBeInstanceOf(SpeechineerQuotaError);
    expect(err.meta).toEqual({ limit: '1000', used: '1000', remaining: '0', layer: 'account:month' });
  });

  it('keeps the two sentences apart, for their two readers', () => {
    const err = fromEvent({
      code: 'EXTRACTION_FAILED',
      type: 'runtime',
      user_message: 'Die Verarbeitung wurde unterbrochen.',
      message: 'Field extraction could not be restarted. Start a new session.',
    });

    // The one a UI shows is the translated one; the one in a stack trace is the English one.
    expect(err.userMessage).toBe('Die Verarbeitung wurde unterbrochen.');
    expect(err.message).toBe('Field extraction could not be restarted. Start a new session.');
  });

  it('keeps the developer sentence when an error is serialised for a log', () => {
    // A structured logger serialises what it is handed. `Error` makes `message` non-enumerable,
    // so without care a logged error would carry its code and translated sentence but not the
    // English one written for whoever reads the log.
    const err = fromEvent({ code: 'FORM_NOT_FOUND', type: 'not_found', message: 'No form with that key.' });

    expect(JSON.parse(JSON.stringify(err)).message).toBe('No form with that key.');
    expect({ ...err }.message).toBe('No form with that key.');
  });

  it('never shows a developer sentence to a user when one is missing', () => {
    // A declared event always carries both — the protocol refuses at class creation otherwise —
    // so this only covers a payload that already broke the contract. Falling back to the code is
    // honest; falling back to `message` is how developer prose reaches a UI.
    const err = fromEvent({ code: 'ODDLY_INCOMPLETE', type: 'service', message: 'internals' });

    expect(err.userMessage).toBe('ODDLY_INCOMPLETE');
    expect(err.message).toBe('internals');
  });

  it('falls back to the base class for a category this build has never heard of', () => {
    // A newer service naming a category must never break an older app's error handling.
    const err = fromEvent({ code: 'SOMETHING_NEW', type: 'teleportation', message: 'hm' });

    expect(err).toBeInstanceOf(SpeechineerError);
    expect(err.type).toBe('teleportation');
  });

  it('leaves an absent category absent rather than guessing one', () => {
    // A close frame whose reason carried no type lands here. Defaulting to `service` would make
    // `instanceof SpeechineerServiceError` true for a failure nobody categorised.
    const err = fromEvent({ code: 'SOMETHING', message: 'no type was sent' });

    expect(err).toBeInstanceOf(SpeechineerError);
    expect(err).not.toBeInstanceOf(SpeechineerServiceError);
    expect(err.type).toBe('');
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
    const e = fromEvent({ code: 'ACCOUNT_QUOTA_EXCEEDED', type: 'quota', message: 'spent' });

    expect(toSpeechineerError(e)).toBe(e);
  });

  it.each([
    [domError('NotAllowedError'), 'MICROPHONE_DENIED', 'Microphone access was denied.'],
    [domError('NotFoundError'), 'MICROPHONE_UNAVAILABLE', 'No usable microphone was found.'],
    [new Error('Audio config required: …'), 'AUDIO_UNSUPPORTED', 'Audio config required: …'],
    [new Error('whatever'), 'UNKNOWN', 'whatever'],
    ['a string', 'UNKNOWN', 'a string'],
  ])('maps %o to %s', (input, code, detail) => {
    const err = toSpeechineerError(input);

    expect(err).toBeInstanceOf(SpeechineerError);
    expect(err.code).toBe(code);
    // The underlying text rides `meta.detail` and is interpolated into the declaration's own
    // sentence — it never replaces it, so the wording stays in one place.
    expect(err.message).toContain(detail);
    // The SDK's own failures: the app's doing, caught before anything was sent.
    expect(err.type).toBe('client');
    expect(err.cause).toBe(input);
  });

  it('gives its own failures a user sentence that is not the developer one', () => {
    const err = toSpeechineerError(domError('NotAllowedError'));

    expect(err.userMessage).toBe('Microphone access was denied. Allow it in the browser to continue.');
    expect(err.message).toContain('user gesture');
  });

  it('renders its own user sentences in the language asked for', () => {
    const err = toSpeechineerError(domError('NotFoundError'), 'de');

    expect(err.userMessage).toBe('Es wurde kein Mikrofon gefunden.');
    // The developer half stays English: it is read by whoever integrates, not by the visitor.
    expect(err.message).toBe('No usable microphone was found.');
  });
});
