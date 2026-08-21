/**
 * The unsigned token the SDK mints for an API key + account. The claim names are pinned
 * byte-for-byte because the portal validates them (an external contract); signed tokens
 * are never minted here — the client forwards them verbatim (see client.test.ts).
 */

import { describe, expect, it } from 'vitest';
import { mintUnsignedToken } from '../src/convert/outbound/common/auth.js';
import { decodeJwt } from './fakes.js';

describe('mintUnsignedToken', () => {
  it('mints an unsigned alg=none JWT with the Speechineer claims', () => {
    const token = mintUnsignedToken('spnr_live_abc', { key: 'acct_1' });
    expect(token.endsWith('.')).toBe(true); // empty signature segment
    const { header, payload } = decodeJwt(token);
    expect(header.alg).toBe('none');
    expect(header.typ).toBe('JWT');
    // frozen claim names — the portal validates them
    expect(payload.api_key).toBe('spnr_live_abc');
    expect(payload.account_key).toBe('acct_1');
    expect(payload.aud).toBe('speechineer');
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect((payload.exp as number) - (payload.iat as number)).toBe(300);
    expect(typeof payload.jti).toBe('string');
    expect(payload.account_pseudonym).toBeUndefined();
  });

  it('includes account_pseudonym only when provided', () => {
    const { payload } = decodeJwt(mintUnsignedToken('k', { key: 'a', pseudonym: 'Dr. X' }));
    expect(payload.account_pseudonym).toBe('Dr. X');
  });

  it('every token carries a fresh jti', () => {
    const a = decodeJwt(mintUnsignedToken('k', { key: 'a' })).payload.jti;
    const b = decodeJwt(mintUnsignedToken('k', { key: 'a' })).payload.jti;
    expect(a).not.toBe(b);
  });

  it('encodes non-ASCII pseudonyms safely (UTF-8 base64url)', () => {
    const { payload } = decodeJwt(mintUnsignedToken('k', { key: 'a', pseudonym: 'Zoë Müller' }));
    expect(payload.account_pseudonym).toBe('Zoë Müller');
  });
});
