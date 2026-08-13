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
- Preserve the final provider stop reason. Output-limit responses and printed
  pseudo tool-call markup receive at most one application-owned corrective
  continuation; a second failure is terminal and typed, never a successful
  completion. Main independently gates accepted Scribe-backed manuscript runs
  on a validated story-reconciliation checkpoint.
- Curator Manuscript or Lore writing requests may create one Main-owned Scribe child task in the
  same utility process. Main assigns its task ID, binds it to the parent request,
  applies a five-minute timeout and 512 KiB artifact limit, propagates
  cancellation, and exposes only the bounded novel-context reader plus a
  terminal artifact-submission tool to Scribe. Main retains the submitted
  Markdown as internal task state while Curator's pre-bound
  `propose_document_writing` call remains pending; no assignment ID or artifact
  receipt is returned to the model. Ordinary assistant text is discarded. Main
  constructs only the already-validated proposal target, so the untrusted
  artifact never bypasses or rebinds the existing proposal workflow, and
  Renderer still shows the full proposal.
- Pi passes each native Tool `AbortSignal` into the worker bridge. Abort,
  request completion, timeout, and duplicate call identities each settle and
  remove exactly one pending bridge entry. Main request release independently
  cancels pending proposal decisions and rejects obsolete project-session work.
- Main Tool failures reject the Pi execution adapter and therefore become
  native error ToolResults. Only the read-only context tool is parallel;
  submissions, maintenance, reconciliation, and proposals are sequential.
- Accepted Scribe-backed Manuscript proposals create durable project-database
  reconciliation jobs. Their pending state is supplied when a Curator request
  starts, so an interrupted run resumes the accepted-document workflow. Lore
  proposals do not open that checkpoint.
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

Persist application-owned conversations and generation records in the project
database independently from Pi session formats so the SDK can be upgraded or
replaced. Each request receives a bounded Driftfield-owned active-branch
transcript; Pi sessions remain temporary runtime objects.

Driftfield stores global model defaults and Pi model overrides under application
data, while project inheritance/selection remains in the unified
`.driftfield/project.sqlite`.
Renderer UI edits typed global model-level settings; main validates them and
generates a `models.json` runtime cache under application data, then
restarts the idle worker and reloads the effective catalogue. The exposed subset includes OpenRouter routing,
thinking-level maps, selected compatibility flags, and literal non-credential
headers.

- OpenRouter upstream-provider selection uses model-level
  `compat.openRouterRouting`, not request headers.
- Thinking-level maps may hide unsupported levels and the ordinary thinking
  selector reflects the effective map returned by Pi.
- Renderer never receives a model-file path or a generic JSON/file mutation
  operation.
- Driftfield rejects Pi shell-command and environment interpolation in UI-owned
  values. API keys and sensitive authorization headers remain in the dedicated
  credential flow.
- Model configuration cannot change while an Agent request is active. Global
  overrides apply consistently to every project that selects the target model.
- The reviewed reset operation stops the idle runtime, clears credentials,
  current-project model selection, global model overrides, and generated
  model/catalog caches, then
  returns the UI to an unconfigured state. It does not touch novel content or
  conversation history.

The Pi subsystem is not production-ready yet:

- API-key credentials, explicit model selection, thinking level, and bounded Pi
  model overrides have UI, validated IPC, and main-owned persistence; OAuth
  flows are not implemented.
- Read-tool calls and returned context are bounded, and output truncation and
  incomplete workflow termination are typed. Total streamed-output, model-input
  context, and monetary-cost budgets remain incomplete.
- Packaged startup and local provider discovery are tested without billable
  provider requests. Real upstream credential rejection, rate limits, network
  failures, full packaged request/cancellation lifecycles, and provider API smoke
  tests still need focused coverage.
- The bundle includes provider adapters beyond those exposed by Driftfield
  because the SDK public entry imports the broader runtime. Reduce this only via
  a supported narrower entry or reliable tree-shaking; do not edit SDK internals.
