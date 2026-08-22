import { createRequire } from 'node:module';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);

export default defineConfig({
  resolve: {
    alias: {
      // Forge main is CommonJS. just-bash's ESM split bundle banners every
      // chunk with createRequire(import.meta.url), which is undefined after
      // Vite rewrites those chunks into CJS.
      'just-bash': require.resolve('just-bash'),
    },
  },
});
