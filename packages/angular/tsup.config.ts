import { defineConfig } from 'tsup';

/**
 * Build the Angular package as bundled ESM + a flat declaration file. `@speechineer/js` is a
 * real dependency (not inlined); `@angular/core` is a peer. Plain `inject`-based functions
 * and an environment provider — no components, so no Angular compiler is involved.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['@angular/core', 'rxjs', '@speechineer/js'],
});
