# Technical Debt and Roadmap

This file records current limitations. It is not evidence that a capability is
implemented or authorized.

## Projects and persistence

- Project selection, open tabs, and unsaved drafts are not restored after
  relaunch. Agent conversations are project-scoped and persisted through the
  main-owned conversation database.
- Watcher retry and close/quit behavior have unit coverage but not complete
  packaged Electron end-to-end coverage on every supported platform.
- YAML comment and exact-format round-trip preservation remains undecided.
- `project-layout-service.ts` still combines pure YAML parsing, filesystem
  validation, complete layout loading, and project initialization. Before adding
  migration or structural-write workflows, separate parser, reader, and
  initializer responsibilities behind the existing service boundary.
- `project-service.ts` still combines project snapshot/scanning behavior with
  serialized document saves. Split snapshot and document-write services before
  Agent apply operations materially expand that file.

## Editor and renderer

- MDXEditor's `autoLoadLanguageSupport` includes the complete CodeMirror dynamic
  language catalog although the UI exposes only JavaScript, JSON, Markdown,
  plain text, and TypeScript. Replace it only with verified explicit language
  support that preserves highlighting in rich-text, source, and diff modes.
- External links have no preload method. If added, route reviewed URLs through a
  narrow validated main handler; never load them in the application window.
- General MDX/JSX remains disabled pending an explicit descriptor, CSP,
  sanitization, and test strategy.
- `use-project-workspace.ts` still coordinates snapshots, dirty state, saves,
  conflicts, project switching, watcher events, window close, and shortcuts.
  Before adding session restoration or more document lifecycle states, move pure
  transitions into a reducer and separate project-session effects from document
  save/close effects without introducing a global state library by default.
- The settings dialog now separates interface and model configuration. Continue
  splitting model override editing into focused components if additional Pi
  capabilities materially expand that panel.
- `WorkspaceShell.tsx` can move panel transition mechanics into a focused hook if
  the shell grows further. Preserve the existing native View Transition behavior
  and do not refactor it solely to reduce line count.

## Agent and Pi

- OAuth provider flows are not implemented.
- Streamed Agent output, total model input context, and monetary cost lack
  complete application-owned budgets and typed terminal reasons.
- Real upstream credential rejection, rate limits, network failures, full
  packaged request/cancellation lifecycles, and billable provider API smoke tests
  lack focused automated coverage.
- Pi's SDK public entry bundles provider adapters beyond those exposed by the
  product. Optimize only through a supported narrower entry or reliable
  tree-shaking while preserving exposed providers and packaged smoke tests.
- Do not enable Pi extensions, untrusted resource discovery, module-relative
  assets, or broader tools before corresponding packaged and security coverage.
- `ProjectContextService` and `AiAgentService` remain intentionally cohesive for
  the current three-tool, single-coordinator prototype. Reassess their split only
  when additional context domains, concurrent specialists, or lifecycle states
  create distinct responsibilities; do not add abstractions preemptively.

## Build and settings

- Review every new `allowBuilds` entry; never approve transitive lifecycle
  scripts merely because pnpm prompts during installation.
- Before the first public release, reset the settings schema instead of adding
  compatibility branches for discarded development formats. After release,
  incompatible changes require an explicit migration.
