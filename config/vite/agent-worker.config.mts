import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main/ai/agent/worker.ts',
      fileName: () => 'agent-worker.mjs',
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        banner:
          'import { createRequire as __driftfieldCreateRequire } from "node:module"; const require = __driftfieldCreateRequire(import.meta.url);',
      },
    },
  },
});
