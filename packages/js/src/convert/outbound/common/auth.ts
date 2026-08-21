/**
 * Outbound auth conversion: an unsigned API key + account → the single wire `auth` **JWT
 * string** (`alg=none`, claims `{ api_key, account_key, account_pseudonym?, aud:'speechineer',
 * iat, exp, jti }`). The service forwards the string to the portal verbatim and never decodes
 * it; the portal validates it. A signed token (Signed API key) is never minted here — the
 * client forwards the developer's token verbatim.
 */

import type { Account } from '../../../types/public/common/auth.js';

/** TTL of a minted token. `auth` is only consumed at the create call, so a short life suffices. */
const AUTH_TTL_SECONDS = 300;

/** UTF-8-safe base64url (no padding) — the JWT segment encoding. */
function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A unique token id (`jti`). Uses `crypto.randomUUID` when available, else a random fallback. */
function newJti(): string {
  const globalCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }
  return `${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}`;
}

/** Encode an unsigned (`alg=none`) compact JWT: `base64url(header).base64url(payload).` (empty sig). */
function encodeUnsignedJwt(claims: Record<string, unknown>): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify(claims));
  return `${header}.${payload}.`;
}

/**
 * Mint the wire `auth` string for an unsigned API key. The claim names are frozen —
 * the portal validates them byte-for-byte.
 */
export function mintUnsignedToken(apiKey: string, account: Account): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    api_key: apiKey,
    account_key: account.key,
    aud: 'speechineer',
    iat: now,
    exp: now + AUTH_TTL_SECONDS,
    jti: newJti(),
  };
  if (account.pseudonym) {
    claims.account_pseudonym = account.pseudonym;
  }
  return encodeUnsignedJwt(claims);
}
