import { defineConfig } from 'tsup';

/**
 * Build the React package as bundled ESM + a flat declaration file. `@speechineer/js` is a
 * real dependency (not inlined) so an app holds ONE client implementation; `react` is a
 * peer. The `'use client'` banner marks the hooks entry for server-component frameworks.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  // No rollup tree-shake pass here: it would strip the module-level directive below.
  external: ['react', '@speechineer/js'],
  banner: { js: "'use client';" },
});
