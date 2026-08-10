const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

const workspaceRoot = path.resolve(__dirname, '../..');

const findAsarFiles = (directory) => {
  if (!fs.existsSync(directory)) return [];
  const matches = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) matches.push(...findAsarFiles(entryPath));
    else if (entry.name === 'app.asar') matches.push(entryPath);
  }
  return matches;
};

const requestedAsar = process.argv[2];
const candidates = requestedAsar
  ? [path.resolve(workspaceRoot, requestedAsar)]
  : findAsarFiles(path.join(workspaceRoot, 'out'));

assert.ok(
  candidates.length > 0,
  'No packaged app.asar was found. Run `pnpm run package` first.',
);

const asarPath = candidates
  .filter((candidate) => fs.existsSync(candidate))
  .sort(
    (left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs,
  )[0];
assert.ok(asarPath, 'The requested packaged app.asar does not exist.');

const entries = asar.listPackage(asarPath);
assert.ok(
  entries.includes('/.vite/build/agent-worker.mjs'),
  'The packaged Pi worker bundle is missing.',
);
const workerBundle = asar.extractFile(
  asarPath,
  '.vite/build/agent-worker.mjs',
).toString('utf8');
assert.match(
  workerBundle,
  /propose_document_file_operation/,
  'The packaged Pi worker is missing the document file-operation tool.',
);
assert.match(
  workerBundle,
  /propose_project_structure_operation/,
  'The packaged Pi worker is missing the project structure-operation tool.',
);
assert.match(
  workerBundle,
  /get_story_state/,
  'The packaged Pi worker is missing the story read tool.',
);
assert.match(
  workerBundle,
  /propose_story_operation/,
  'The packaged Pi worker is missing the reviewed story-operation tool.',
);

const electronPath = require('electron');
const smoke = spawnSync(
  electronPath,
  [path.join(__dirname, 'pi-smoke-main.cjs'), asarPath],
  { encoding: 'utf8', timeout: 45_000 },
);

if (smoke.stdout) process.stdout.write(smoke.stdout);
if (smoke.stderr) process.stderr.write(smoke.stderr);
assert.equal(
  smoke.status,
  0,
  smoke.error?.message ||
    `Packaged Pi smoke exited with status ${smoke.status} and signal ${smoke.signal}.`,
);
