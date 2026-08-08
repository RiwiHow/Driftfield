const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

const workspaceRoot = path.resolve(__dirname, '..');

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
const rendererScripts = entries.filter(
  (entry) =>
    entry.startsWith('/.vite/renderer/main_window/assets/') &&
    entry.endsWith('.js'),
);
assert.ok(rendererScripts.length > 0, 'Packaged renderer scripts are missing.');

const extractText = (entry) =>
  asar.extractFile(asarPath, entry.replace(/^\//, '')).toString('utf8');
const mainBundle = extractText('/.vite/build/main.js');
const rendererBundle = rendererScripts.map(extractText).join('\n');
const rendererHtml = extractText('/.vite/renderer/main_window/index.html');
const packagedManifest = JSON.parse(extractText('/package.json'));

for (const [bundleName, bundle] of [
  ['main', mainBundle],
  ['renderer', rendererBundle],
]) {
  assert.ok(
    bundle.includes('Open local project'),
    `${bundleName} English catalog is missing.`,
  );
  assert.ok(
    bundle.includes('打开本地项目'),
    `${bundleName} Chinese catalog is missing.`,
  );
}

assert.match(rendererHtml, /<html lang="en">/);
assert.equal(packagedManifest.dependencies?.['i18next-http-backend'], undefined);
assert.equal(
  packagedManifest.dependencies?.['i18next-browser-languagedetector'],
  undefined,
);

console.log(`Packaged i18n smoke test passed: ${asarPath}`);
