# Pi Worker Integration

Pi and other model SDKs remain behind a Driftfield-owned interface in
`src/main/ai/`. SDK-specific types do not leak into renderer features or shared
domain contracts.

## Runtime boundary

- Prefer `@earendil-works/pi-coding-agent` behind the application adapter rather
  than depending directly on `pi-agent-core`.
- Electron main and preload remain Forge 7 CommonJS targets.
- Pi loads only inside the separately built native ESM `agent-worker.mjs`
  Electron utility process.
- Credentials and provider calls remain in the privileged backend. Main owns
  auth/model file locations and worker lifecycle.
- The worker may read only application-owned auth/model files and never exposes
  their paths or contents to preload or renderer.
- Pi uses the application-owned Agent data directory as its working directory,
  never the opened novel folder.
- Project and future database authority remain in main services. The worker asks
  for bounded operations over the internal typed utility-process protocol.
- Stream typed deltas through cancellable IPC. Bind requests to application-owned
  project-session identity and reject obsolete output and tool calls.
- Do not enable Pi coding tools, generic shell/filesystem tools, extensions, or
  unrestricted resource discovery by default.

An Electron utility process is a lifecycle and isolation boundary, not a
security sandbox. Availability of Node APIs does not authorize untrusted
extensions, arbitrary code execution, shell access, or unrestricted project and
database access.

## ESM interoperability

The worker-only Vite build defines `require` with Node's
`createRequire(import.meta.url)` because some Pi CommonJS transitive dependencies
still call bare `require()` for Node built-ins. Vite/Rolldown currently emits
multiple ESM chunks, so the worker banner supplies the same lexical `require` to
each affected chunk.

This is Node's supported ESM-to-CommonJS interoperability mechanism. It is not an
`import.meta.url` text rewrite and is not a general bundling convention.

- Do not move the banner to main or preload builds.
- Do not use it as permission to import Pi from the CommonJS main bundle.
- Do not package the full production `node_modules` tree to make Pi load in main.
- Reassess and remove the banner when Pi and its dependencies are fully ESM or
  the bundler reliably converts the remaining imports.
- Re-run packaged-ASAR worker startup smoke tests whenever Pi, Electron, Forge,
  Vite, or Rolldown changes.

Keep the shared main/preload Vite configuration while their behavior matches.
Split it only when targets genuinely require different behavior.

## Persistence and current limitations

Persist application-owned generation records independently from Pi session
formats so the SDK can be upgraded or replaced.

The Pi subsystem is not production-ready yet:

- API-key credentials, explicit model selection, and thinking level have UI,
  validated IPC, and main-owned persistence; OAuth flows are not implemented.
- Read-tool calls and returned context are bounded, but streamed output, total
  model input context, and monetary cost lack complete application-owned budgets
  and typed terminal reasons.
- Packaged startup and local provider discovery are tested without billable
  provider requests. Real upstream credential rejection, rate limits, network
  failures, full packaged request/cancellation lifecycles, and provider API smoke
  tests still need focused coverage.
- The bundle includes provider adapters beyond those exposed by Driftfield
  because the SDK public entry imports the broader runtime. Reduce this only via
  a supported narrower entry or reliable tree-shaking; do not edit SDK internals.
