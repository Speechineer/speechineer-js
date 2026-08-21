import { defineConfig } from 'tsup';

/**
 * Build the JavaScript SDK as bundled ESM + a flat declaration file. One entry, no
 * framework externals — this package has no peer dependencies; the React and Angular
 * packages depend on it and externalize it in their own builds.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
});
