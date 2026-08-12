const { spawnSync } = require('node:child_process');
const path = require('node:path');

const electronPath = require('electron');
const vitestPath = path.join(
  path.dirname(require.resolve('vitest/package.json')),
  'vitest.mjs',
);
const forwardedArguments = process.argv.slice(2);
if (forwardedArguments[0] === '--') forwardedArguments.shift();
const result = spawnSync(
  electronPath,
  [vitestPath, 'run', ...forwardedArguments],
  {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
