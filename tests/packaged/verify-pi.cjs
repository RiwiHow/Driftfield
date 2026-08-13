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

const entries = asar.listPackage(asarPath).map((entry) =>
  entry.replaceAll('\\', '/'),
);
assert.ok(
  entries.includes('/.vite/build/agent-worker.mjs'),
  'The packaged Pi worker bundle is missing.',
);
const workerBundle = asar.extractFile(
  asarPath,
  path.normalize('.vite/build/agent-worker.mjs'),
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
  /rename_document/,
  'The packaged Pi worker is missing reviewed document-title renaming.',
);
assert.match(
  workerBundle,
  /metadataTitle.*displayTitle|displayTitle.*metadataTitle/,
  'The packaged Pi worker does not distinguish metadata and display titles.',
);
assert.match(
  workerBundle,
  /read_novel_context/,
  'The packaged Pi worker is missing the unified novel-context read tool.',
);
assert.match(
  workerBundle,
  /maintain_story_records/,
  'The packaged Pi worker is missing the direct story-maintenance tool.',
);
assert.match(
  workerBundle,
  /clientRef/,
  'The packaged Pi worker is missing atomic story-maintenance references.',
);
assert.match(
  workerBundle,
  /propose_document_writing/,
  'The packaged Pi worker is missing the pre-bound Curator-to-Scribe document tool.',
);
assert.match(
  workerBundle,
  /submit_writing_artifact/,
  'The packaged Pi worker is missing the delimited Scribe artifact submission tool.',
);
assert.doesNotMatch(
  workerBundle,
  /revise_writing_artifact/,
  'The packaged Pi worker still advertises the retired artifact-revision tool.',
);
assert.doesNotMatch(
  workerBundle,
  /writingAssignmentId/,
  'The packaged Pi worker still exposes assignment IDs to the model.',
);
assert.doesNotMatch(
  workerBundle,
  /delegate_writing/,
  'The packaged Pi worker still advertises the retired low-level delegation tool.',
);
assert.match(
  workerBundle,
  /documentAction/,
  'The packaged Pi worker is missing the pre-bound create-or-replace document plan.',
);
assert.doesNotMatch(
  workerBundle,
  /baseContentRevision|baseRevision|projectRevision|storyRevision/,
  'The packaged Pi worker still asks the model for concurrency revisions Main anchors itself.',
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
