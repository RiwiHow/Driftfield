import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        banner:
          'const __driftfieldImportMetaUrl = require("node:url").pathToFileURL(__filename).href;',
      },
    },
  },
  plugins: [
    {
      name: 'pi-cjs-import-meta-url',
      transform(code, id) {
        if (
          !id.includes('/node_modules/@earendil-works/') ||
          !code.includes('import.meta.url')
        ) {
          return null;
        }
        return code.replaceAll(
          'import.meta.url',
          '__driftfieldImportMetaUrl',
        );
      },
    },
  ],
});
