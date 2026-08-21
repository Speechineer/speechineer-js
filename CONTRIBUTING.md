# Contributing

Thanks for your interest in the Speechineer SDK. This repository is developed by Aicendence
GmbH; **issues and feature requests are welcome**, and pull requests are reviewed on request —
open an issue first so we can agree on the change.

## Setup

Node 24 (see `.nvmrc`) and npm 11+.

```bash
npm install          # links the workspace (packages/js, packages/react, packages/angular)
npm run build        # every package, js first
npm run typecheck
npm test             # vitest — packages/js/test
npm run lint         # biome (packages/js)
npm run check:packages   # publint + arethetypeswrong on the built packages
```

The architecture, the naming laws and the recipes (add a capability, mirror a new API field)
are in [`CLAUDE.md`](CLAUDE.md) — read it before changing `packages/js/src/`.

## Making a change

1. Branch from `develop`.
2. Keep the public API in customer language: every exported symbol's TSDoc is generated into
   the API reference (no internals, no vendors; every property documented).
3. Add or adapt tests in `packages/js/test/` (deterministic fakes, explicit transitions).
4. **Declare a changeset** for any consumer-visible change: `npm run changeset` — see
   [`VERSIONING.md`](VERSIONING.md) for the bump mapping (one shared version, fixed group).
   Docs-, tooling- and test-only changes take no changeset.
5. Run the checks above; open the pull request against `develop`.

## Releasing (maintainers)

Merging to `develop` runs the release workflow: pending changesets open (or update) a
"Version Packages" pull request; merging that PR bumps the three packages together, updates
the CHANGELOGs, and publishes to npm with provenance (trusted publishing — no tokens).

## Security

Please report vulnerabilities privately — see [`SECURITY.md`](SECURITY.md).

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

## License

By contributing you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE) (Section 5 of the License).
