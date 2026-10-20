/**
 * Conformance: the SDK's hand-mirrored vocabulary against the service's own export.
 *
 * This is the guard the FLY-498 migration exists to install. The SDK mirrors the protocol by
 * hand — it is TypeScript, the declarations are Python — and a hand mirror drifts silently. It
 * already did: the service renamed the session-lookup code from `SESSION_NOT_FOUND` to
 * `WORKFLOW_NOT_FOUND`, the SDK kept its own copy of the old name in `SDK_ERRORS` so every
 * `satisfies` check still compiled, and the entire resume chain stopped advancing with nothing
 * red anywhere. Comparing against a copy of your own beliefs cannot catch that; comparing
 * against the service's export can.
 *
 * Contributor notes (not rendered):
 * - **Why a vendored fixture.** This package is exported to a standalone public repo whose CI
 *   runs `npm test` with no `protocol/` beside it, so the assertions have to work from a copy
 *   that travels with the package. Refresh it with `nur local utils manifest protocol` followed
 *   by copying `protocol/manifest.json` over `test/fixtures/protocol-manifest.json`.
 * - **And why that is still safe.** A stale fixture would make the vocabulary assertions pass
 *   against yesterday's truth, so the last test below compares the fixture to the live
 *   `protocol/manifest.json` whenever it is reachable — which is exactly inside this ensemble,
 *   the one place both halves exist. Nothing is skipped: every assertion that can run, runs.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SDK_ERRORS, SDK_LANGUAGES } from '../src/errors/manifest.js';
import { RESUMABLE_CODE } from '../src/errors/guards.js';
import {
  DEBUG_TYPES,
  EVENT_LEVELS,
  INFO_TYPES,
  STATUS_BY_ERROR_TYPE,
  TYPES_FOR_LEVEL,
  WARNING_TYPES,
  closeCodeFor,
  type ErrorTypeSdk,
} from '../src/types/sdk/common/event.js';

interface Manifest {
  codes: Record<
    string,
    {
      level: string;
      type: string;
      /** `public` reaches an SDK caller; `console` is the operator plane. Errors only. */
      audience?: string;
      status?: number;
      close_code?: number;
      dev_message: string;
      user_message: Record<string, string>;
      meta: string[];
    }
  >;
  languages: string[];
  levels: Record<string, number>;
  types: Record<string, Record<string, { status?: number; close_code?: number }>>;
}

const read = (url: URL): Manifest | null => {
  try {
    return JSON.parse(readFileSync(url, 'utf8')) as Manifest;
  } catch {
    return null;
  }
};

const FIXTURE_URL = new URL('./fixtures/protocol-manifest.json', import.meta.url);
const LIVE_URL = new URL('../../../../protocol/manifest.json', import.meta.url);

const fixture = read(FIXTURE_URL);
const live = read(LIVE_URL);

describe('conformance with the service vocabulary', () => {
  it('has a manifest to check against at all', () => {
    // Without this the suite could go green by finding nothing — the failure mode a conformance
    // test must never have.
    expect(fixture, 'test/fixtures/protocol-manifest.json is missing').not.toBeNull();
  });

  const manifest = fixture as Manifest;

  it('mirrors the level vocabulary exactly', () => {
    // `critical` was removed from the contract; a mirror that kept it would let a caller filter
    // on a level nothing can ever emit.
    expect([...EVENT_LEVELS].sort()).toEqual(Object.keys(manifest.levels).sort());
  });

  it('mirrors every failure category, with its status', () => {
    const declared = manifest.types.error;
    expect(Object.keys(STATUS_BY_ERROR_TYPE).sort()).toEqual(Object.keys(declared).sort());
    for (const [type, spec] of Object.entries(declared)) {
      expect(STATUS_BY_ERROR_TYPE[type as ErrorTypeSdk], `status of ${type}`).toBe(spec.status);
      // The close code is the same projection derived twice, on two sides of the wire. Deriving
      // it rather than listing it is what stopped this SDK's old 4501-4505 table from rotting.
      expect(closeCodeFor(type as ErrorTypeSdk), `close code of ${type}`).toBe(spec.close_code);
    }
  });

  it('mirrors the notice categories for every non-terminal level', () => {
    expect([...WARNING_TYPES].sort()).toEqual(Object.keys(manifest.types.warning).sort());
    expect([...INFO_TYPES].sort()).toEqual(Object.keys(manifest.types.info).sort());
    expect([...DEBUG_TYPES].sort()).toEqual(Object.keys(manifest.types.debug).sort());
  });

  it('gives every level a vocabulary, so no event can be uncategorisable', () => {
    for (const level of EVENT_LEVELS) {
      expect([...TYPES_FOR_LEVEL[level]].sort()).toEqual(Object.keys(manifest.types[level]).sort());
    }
  });

  it('speaks the same languages the service translates into', () => {
    // The SDK renders its OWN sentences; these are the languages it must have a string for.
    expect([...SDK_LANGUAGES].sort()).toEqual([...manifest.languages].sort());
  });

  it('declares no code that could reach a caller from the service too', () => {
    // `SDK_ERRORS` is for failures raised inside this package, before anything was sent. A code
    // that ALSO arrives from the service is an ambiguity for whoever branches on it: one name,
    // two meanings, and no way to tell which one they have.
    //
    // Scoped to what an SDK caller can actually receive — `audience: "public"` errors, plus
    // every notice (those have no audience and all travel on the session connection). The
    // service's ~96 console-only codes live on the operator plane and never cross this
    // boundary, so one of them sharing a name is not an ambiguity anybody can observe.
    //
    // There IS one such overlap today, found by this test on its first run: the portal declares
    // `NO_CLIENT` for "no organization is associated with this login" (console, 422) while the
    // SDK raises it for "no Speechineer client is available" from the framework bindings. Two
    // unrelated senses of the word "client", on two disjoint planes. Worth renaming one for
    // tidiness — a decision for the vocabulary's owner, not for this test to force.
    const reachable = new Set(
      Object.entries(manifest.codes)
        .filter(([, d]) => d.level !== 'error' || d.audience === 'public')
        .map(([code]) => code),
    );
    const collisions = Object.keys(SDK_ERRORS).filter((code) => reachable.has(code));
    expect(collisions, 'these codes can reach a caller from BOTH sides').toEqual([]);
  });

  it('pairs every SDK-declared code with a category the contract knows', () => {
    for (const [code, declared] of Object.entries(SDK_ERRORS)) {
      expect(Object.keys(manifest.types.error), `type of ${code}`).toContain(declared.type);
    }
  });

  it('carries a sentence in every language for every code it declares itself', () => {
    for (const [code, declared] of Object.entries(SDK_ERRORS)) {
      expect(declared.devMessage.length, `${code} has no developer sentence`).toBeGreaterThan(0);
      for (const language of SDK_LANGUAGES) {
        expect(declared.userMessage[language]?.length, `${code} has no ${language}`).toBeGreaterThan(0);
      }
    }
  });

  it('waits for a resume code the service actually sends', () => {
    // THE regression this file exists for. `RESUMABLE_CODE` is the single string the whole
    // get → create(oldId) → create() chain turns on, and it is pinned byte-for-byte because it
    // is on the wire (the sanctioned frozen-value exception in the testing-strategy rule).
    expect(RESUMABLE_CODE).toBe('WORKFLOW_NOT_FOUND');
    const declared = manifest.codes[RESUMABLE_CODE];
    expect(declared, `the service declares no ${RESUMABLE_CODE}`).toBeDefined();
    // It must also stay a 404 the SDK can tell apart from every other 404.
    expect(declared.type).toBe('not_found');
    expect(declared.level).toBe('error');
  });

  it('would notice the codes it names in its own guards disappearing', () => {
    // Narrow on purpose: only the codes this package reasons about by name. Pinning all 194
    // would fail on every legitimate addition, which is the registry-pin anti-pattern.
    for (const code of ['WORKFLOW_NOT_FOUND', 'STOP_RECORDING_REQUESTED']) {
      expect(manifest.codes[code], `the service no longer declares ${code}`).toBeDefined();
    }
  });

  it('checks the vendored fixture against the live export when both are present', () => {
    // Inside the ensemble, `protocol/manifest.json` is right there — so a fixture that has
    // fallen behind fails HERE, in the only repo that can see both halves. In the exported
    // public package the live file does not exist and the assertions above still stand on their
    // own, which is why this is the last test and not a precondition of the others.
    if (!live) return;
    expect(live, 'the vendored fixture has fallen behind protocol/manifest.json — refresh it')
      .toEqual(fixture);
  });
});
