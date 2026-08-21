# Versioning — Speechineer SDK packages

**ONE version for the whole SDK surface** — `@speechineer/js`, `@speechineer/react` and
`@speechineer/angular` share it, held together by the single Changesets **fixed group**
([`.changeset/config.json`](.changeset/config.json)). The number is a **surface
guarantee**: same version = same public API, across every framework. There are no
per-framework version lines, and no compatibility matrix to answer support questions with.
Current line: **0.x** (pre-API-freeze). The framework packages' `@speechineer/js`
dependency is pinned to the current version (Changesets validates and maintains it on every
bump — do not reset it to `*`).

Two consequences, both intended:

- **A change inside `@speechineer/js` with no surface effect takes no changeset** — it ships
  silently inside the next cut, and nothing bumps for it alone.
- **A surface change bumps everything at once**, because the surface is defined by
  `@speechineer/js` and the framework packages are bindings over it. A framework-specific fix
  bumps the others too; their changelog entry simply names the affected package.

## Declaring a change (every commit)

Every commit that touches package behavior carries a changeset file
(`npm run changeset`, or write `.changeset/<name>.md` by hand):

```md
---
"@speechineer/js": patch
---

One-line summary, imperative mood, consumer-visible wording.
```

Naming any one package suffices — the fixed group bumps all three identically.
Changes with no consumer-visible effect (CI, internal docs, test-only) take **no**
changeset.

## Bump mapping — 0.x (current)

Changesets applies declarations literally (`major` on 0.7.0 → 1.0.0), so **never declare
`major` while on 0.x**:

| Change | Declare | Result |
|---|---|---|
| Breaking public-API change (removed/renamed export, changed option/contract shape) | `minor` | 0.7.x → 0.8.0 |
| New backwards-compatible feature (new capability, option) | `patch` | 0.7.0 → 0.7.1 |
| Bugfix / consumer-visible refactor | `patch` | 0.7.0 → 0.7.1 |
| Public-API freeze — deliberate team decision only | `major` | 0.x → 1.0.0 |

## Bump mapping — from 1.0.0 (future)

Full SemVer: breaking → `major`, feature → `minor`, fix → `patch`. Update the table
above when the freeze happens.

## Cutting a version

Releases are cut by the release workflow (`.github/workflows/release.yml`): every push to
`develop` with pending changesets opens or updates a **"Version Packages"** pull request
(one bump for the fixed group + the CHANGELOG entries). Merging that PR publishes the three
packages to npm with provenance (trusted publishing) and creates the GitHub releases.
Never run `changeset version` (`npm run version-packages`) ad hoc on a feature branch.

## Adding a framework (Vue, Svelte, …)

1. Add the package — `packages/<framework>` — with its own `typedoc.json` (copy
   `packages/react/typedoc.json`) and a `src/docs-entry.ts` listing the bindings + their
   option/result types (shared types live in `packages/js/src/core.ts` — the Core reference
   documents them once for every framework).
2. Add the package to the **existing `fixed` group** in `.changeset/config.json` — never a
   second group. It adopts the shared version at the next cut.
3. Add the language to [`docs-packages.json`](docs-packages.json): `id` (appears in doc
   URLs — stable once published; `core` is reserved), `label`, and its package. The
   API-reference generator and the docs site both read that registry, so the new framework
   appears in the pickers with no code change.
