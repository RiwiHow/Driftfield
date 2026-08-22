import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config = {
  packagerConfig: {
    appBundleId: 'com.driftfield.app',
    asar: true,
  },
  makers: [
    new MakerDMG({}, ['darwin']),
    new MakerZIP({}, ['darwin']),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'config/vite/electron.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'config/vite/electron.config.mts',
          target: 'preload',
        },
        {
          entry: 'src/main/ai/agent/worker.ts',
          config: 'config/vite/agent-worker.config.mts',
          target: 'main',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'config/vite/renderer.config.mts',
        },
      ],
    }),
  ],
};

export default config;
