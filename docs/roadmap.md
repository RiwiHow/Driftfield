# Technical Debt and Roadmap

This file records current limitations. It is not evidence that a capability is
implemented or authorized.

## Projects and persistence

- The last successfully opened project is restored after relaunch. Open tabs,
  the active document, editor position, and unsaved drafts remain session-only.
  Agent conversations are project-scoped and persisted through the main-owned
  conversation database.
- Watcher retry and close/quit behavior have unit coverage but not complete
  packaged Electron end-to-end coverage on every supported platform.
- YAML comment and exact-format round-trip preservation remains undecided.
- Project databases have transactional migrations, strict schemas, and bounded
  access, but there is no application-owned integrity check, corruption-recovery
  workflow, coordinated three-database backup, or packaged database smoke test.
  Define these before project databases become irreplaceable released user data.
- Driftfield does not currently claim an application-wide single-instance lock
  or a project-level writer lease. Before supporting multiple application
  instances, define how concurrent access to the same manuscript and its three
  SQLite databases is detected and resolved; otherwise enforce single-instance
  ownership explicitly.

## Editor and renderer

- MDXEditor's `autoLoadLanguageSupport` includes the complete CodeMirror dynamic
  language catalog although the UI exposes only JavaScript, JSON, Markdown,
  plain text, and TypeScript. Replace it only with verified explicit language
  support that preserves highlighting in rich-text, source, and diff modes.
- External links have no preload method. If added, route reviewed URLs through a
  narrow validated main handler; never load them in the application window.
- General MDX/JSX remains disabled pending an explicit descriptor, CSP,
  sanitization, and test strategy.
- The settings dialog separates interface and model configuration into focused
  nested feature directories. Model override routing, thinking-map,
  compatibility, and header sections now have separate components, and reusable
  form transitions are pure helpers. Preserve those ownership boundaries as Pi
  capabilities expand rather than accumulating provider-specific behavior in the
  dialog or override-form composition components.
- Agent conversation history load, refresh, rename, selection, and deletion
  failures do not yet have complete typed, user-visible error states. Do not
  represent a failed history load as an empty history, and keep persisted Main
  state authoritative when an optimistic Renderer operation fails.
- Renderer tests cover conversation reducers and timeline helpers, but not the
  complete asynchronous `use-agent-conversation.ts` lifecycle or the settings
  dialog's project-switch, explicit-save, and failure paths. Add focused hook or
  component integration coverage before these workflows expand further.

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
- Conversation limits bound active lists and model context, but soft-deleted
  conversations and inactive edit branches remain retained for audit. Define
  export, permanent deletion, retention, and database-compaction semantics before
  long-lived projects depend on unbounded conversation history.
- Do not enable Pi extensions, untrusted resource discovery, module-relative
  assets, or broader tools before corresponding packaged and security coverage.
- `ProjectContextService` and `AiAgentService` remain intentionally cohesive for
  the current bounded-tool, single-coordinator prototype. Reassess their split only
  when additional context domains, concurrent specialists, or lifecycle states
  create distinct responsibilities; do not add abstractions preemptively.

## Build and settings

- Review every new `allowBuilds` entry; never approve transitive lifecycle
  scripts merely because pnpm prompts during installation.
- Distribution currently targets macOS DMG and ZIP only. Before a public
  release, define supported operating systems and complete the corresponding
  signing, notarization, update, and release-channel policy instead of implying
  that a local Forge artifact is a production-ready installer.
- Before the first public release, reset the settings schema instead of adding
  compatibility branches for discarded development formats. After release,
  incompatible changes require an explicit migration.
