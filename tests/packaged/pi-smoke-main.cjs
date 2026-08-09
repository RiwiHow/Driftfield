const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, utilityProcess } = require('electron');

const asarPath = process.argv[2];
const expectedProviders = [
  'anthropic',
  'openai',
  'google',
  'openrouter',
  'deepseek',
  'mistral',
];

const finish = (error, worker, temporaryDirectory) => {
  if (finish.done) return;
  finish.done = true;
  clearTimeout(finish.timeout);
  worker?.kill();
  if (temporaryDirectory) {
    fs.rmSync(temporaryDirectory, { force: true, recursive: true });
  }
  if (error) {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  }
  app.quit();
};

void app.whenReady().then(() => {
  let worker;
  let temporaryDirectory;
  try {
    assert.ok(asarPath, 'A packaged app.asar path is required.');
    temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'driftfield-packaged-pi-'),
    );
    const authPath = path.join(temporaryDirectory, 'auth.json');
    const modelsPath = path.join(temporaryDirectory, 'models.json');
    fs.writeFileSync(
      authPath,
      `${JSON.stringify(
        Object.fromEntries(
          expectedProviders.map((providerId) => [
            providerId,
            { key: 'packaged-smoke-not-a-real-key', type: 'api_key' },
          ]),
        ),
      )}\n`,
      { mode: 0o600 },
    );
    fs.writeFileSync(
      modelsPath,
      `${JSON.stringify({
        providers: {
          openrouter: {
            modelOverrides: {
              'anthropic/claude-3-haiku': {
                compat: {
                  openRouterRouting: {
                    allow_fallbacks: false,
                    data_collection: 'deny',
                    only: ['anthropic'],
                    order: ['anthropic'],
                    require_parameters: true,
                    zdr: true,
                  },
                },
              },
            },
          },
        },
      })}\n`,
      { mode: 0o600 },
    );

    worker = utilityProcess.fork(
      path.join(asarPath, '.vite', 'build', 'agent-worker.mjs'),
      [],
      { serviceName: 'Driftfield packaged Pi smoke', stdio: 'ignore' },
    );
    const requestId = 'packaged-provider-smoke';
    worker.on('message', (message) => {
      if (message?.type === 'ready') {
        worker.postMessage({
          authPath,
          modelsPath,
          requestId,
          type: 'list-models',
        });
        return;
      }
      if (message?.requestId !== requestId) return;
      if (message.type === 'models-error') {
        finish(
          new Error(`Packaged provider discovery failed: ${message.code}`),
          worker,
          temporaryDirectory,
        );
        return;
      }
      if (message.type === 'models') {
        const discovered = new Set(message.models.map(({ providerId }) => providerId));
        for (const providerId of expectedProviders) {
          assert.ok(
            discovered.has(providerId),
            `Packaged Pi runtime is missing provider: ${providerId}`,
          );
        }
        console.log(
          `Packaged Pi smoke test passed for ${expectedProviders.length} providers.`,
        );
        finish(null, worker, temporaryDirectory);
      }
    });
    worker.once('error', (error) => finish(error, worker, temporaryDirectory));
    worker.once('exit', (code) => {
      if (!finish.done && code !== 0) {
        finish(
          new Error(`Packaged Pi worker exited unexpectedly (${code}).`),
          worker,
          temporaryDirectory,
        );
      }
    });
    finish.timeout = setTimeout(
      () =>
        finish(
          new Error('Packaged Pi worker timed out.'),
          worker,
          temporaryDirectory,
        ),
      30_000,
    );
  } catch (error) {
    finish(error, worker, temporaryDirectory);
  }
});
