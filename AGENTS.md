# Driftfield Development Guide

Driftfield is a local-first AI novel-writing desktop application built with
Electron, React, TypeScript, Vite, and Electron Forge. pnpm is the only package
manager for npm dependencies.

This root file is the only `AGENTS.md` in the repository. Keep detailed project
documentation under `docs/`, not under `src/`. Before changing a subsystem, read
the corresponding document in the documentation index below and preserve its
constraints.

## Process Boundaries

- `main` owns windows, files, databases, credentials, model SDKs, persistence,
  and operating-system integration.
- `preload` exposes a small typed allow-list through `contextBridge`.
- `renderer` is unprivileged and must not access Node.js, Electron internals,
  databases, credentials, or project files directly.
- `shared` contains pure serializable contracts and types. It must not import
  Electron, Node-only modules, React, or database drivers.

Extend the existing architecture rather than introducing a parallel one. Keep
`App.tsx` as a composition layer and put renderer business logic in features.
See [Architecture](docs/architecture.md).

## Security Invariants

Do not weaken these `BrowserWindow.webPreferences` settings:

```ts
contextIsolation: true
nodeIntegration: false
sandbox: true
```

- Never expose `ipcRenderer` or a generic `send` method through preload.
- Define one narrow preload method per operation.
- Validate privileged IPC payloads and sender identity at runtime.
- Keep channels centralized and process-boundary contracts serializable under
  `src/shared/contracts/`.
- Keep API keys and OAuth tokens out of renderer state, local storage, logs, and
  source control.
- Keep database access in main. Global mutable data and credentials stay under
  `app.getPath('userData')`; project-owned structured data lives only in the
  main-owned `.driftfield` databases, never in ASAR or renderer authority.
- Do not load remote pages into the privileged main window.
- Keep renderer CSP restrictive and review every added source.
- Deny unexpected navigation and new windows. Open reviewed external URLs only
  through a narrow main-owned operation.
- Never silently overwrite novel text with generated output. Generated changes
  must be previewable, cancellable, revision-checked, and recoverable.

## Source and Test Placement

- Source belongs under the existing `src/main`, `src/preload`, `src/renderer`,
  and `src/shared` boundaries.
- All tests belong under root `tests/`, mirroring the source area. Do not place
  `*.test.ts` or `*.test.tsx` under `src/`.
- Post-package ASAR or installer assertions belong under `tests/packaged/` and
  run through dedicated package scripts.
- `node_modules/`, `.vite/`, `out/`, and `.pnpm-store/` are generated output, not
  source code.
- Preserve unrelated user changes in a dirty worktree.

## IPC and Persistence

IPC is an application boundary, not an implementation shortcut.

- Use request IDs for streamed and cancellable operations.
- Convert internal failures to small typed serializable error contracts.
- Never send functions, class instances, Electron objects, database handles,
  repositories, SDK sessions, or custom prototypes across IPC.
- Database drivers belong under `src/main/database/`; introduce migrations with
  the first persisted schema and keep SQL behind repositories.
- Use transactions for multi-record changes.
- Renderer state is transient UI/cache state; main services and repositories are
  authoritative for persisted novels.

See [Architecture](docs/architecture.md) for detailed IPC and database rules.

## Project Format

New-format projects use:

```text
novel/
├── .driftfield/
│   ├── project.sqlite
│   ├── conversations.sqlite
│   └── settings.sqlite
├── manuscript/
│   └── _index.yaml
└── lore/
    └── _index.yaml
```

- New projects create lowercase physical `manuscript` and `lore` roots.
  Existing projects may omit `lore`; its absence must never block opening a
  manuscript.
- Selecting an empty directory initializes the databases, manuscript, and
  lore indexes.
- Recognize a nonempty project through the fixed marker, stable ID, and positive
  format version in `.driftfield/project.sqlite`. Report a missing database
  separately from a damaged database. The project format version is not yet a
  compatibility gate.
- `project.sqlite` owns stable project identity and future authoritative world,
  timeline, plot, and mutation-ledger state. `conversations.sqlite` owns Agent
  conversations and generation/tool audit data. `settings.sqlite` owns
  project-level model selection and overrides.
- Cross-database references use validated stable IDs and never SQLite foreign
  keys. Conversation records may refer to tool operations, but they are not the
  authority for world state.
- `project.sqlite` owns the project title and optional reviewed icon ID.
- Each semantic directory `_index.yaml` owns its stable ID, kind, display title,
  explicit child order, and inherited numbering/label policy.
- Paths, filenames, titles, numbers, and array positions are not stable IDs.
- Parse YAML only in main with a safe schema, strict runtime validation, bounded
  input, exact keys/kinds, regular-file checks, and canonical containment.
- Formatters are constrained data templates, never executable expressions and
  never sources of paths or IDs.
- Renderer and Agent workers do not parse, construct, or mutate metadata paths.
- Agents never edit YAML directly. Structural changes use propose, preview,
  approve, revision-check, and main-owned apply.
- Support manuscript `.md` and `.markdown`, not general MDX/JSX.
- Do not promise YAML comment/format preservation until that product decision is
  explicit.
- `.driftfield` is main-owned mutable project data. Scanners and watchers ignore
  it; credentials never enter it, and it is not a generic Agent filesystem.

See [Project Format](docs/project-format.md).

## AI, Tools, and Prompts

- Keep model SDKs behind a Driftfield-owned interface in `src/main/ai/`.
- Keep credentials, providers, project/file authority, and future database
  authority in the privileged backend.
- Pi runs only in the separately built native ESM `agent-worker.mjs` utility
  process. Main and preload remain Forge CommonJS targets.
- A utility process is not a security sandbox. Do not enable Pi coding tools,
  shell/filesystem tools, untrusted extensions, arbitrary resource discovery,
  or generic code execution.
- Pi works from application-owned Agent data, never the opened novel directory.
- Bind Agent requests to project-session identity, propagate cancellation, and
  reject obsolete output and tool calls after project switches.
- Prefer narrow novel-domain tools with typed protocols, strict scope checks,
  timeouts, call limits, and result-size budgets.
- Agents may use the bounded Maintain tool to apply additive or linking
  Personae, Chronicle, and Threads operations within the user's explicit
  request. Main still owns validation, revision checks, transactions, and the
  mutation ledger. Manuscript generation and destructive or high-impact
  mutations retain proposal, preview, approval, and main-owned apply semantics.

### Tool and prompt source of truth

- A tool's `defineTool()` registration is the single source of truth for its
  name, description, and parameter schema.
- Native Tool Calling tells the model which tools are enabled. Do not duplicate
  individual tool descriptions in the system prompt.
- Versioned system prompts under `src/main/ai/prompts/` contain immutable
  application boundaries, role instructions, and cross-tool usage policy.
- Do not accept arbitrary renderer-supplied system prompts.
- Whenever a tool is added, removed, or its semantics change, explicitly review
  `src/main/ai/prompts/prompt-builder.ts` and update the cross-tool policy when
  needed.
- If that review changes model-facing prompt behavior, bump the affected prompt
  profile versions.
- Update shared contracts and add focused protocol, dispatcher, lifecycle, and
  packaged-worker tests appropriate to the changed capability.

The current read-only surface is `get_novel_structure`,
`get_current_document`, and `get_document`. It returns stable-ID-based,
path-free context through main-owned services. Do not broaden this surface with
generic filesystem or database access.

See [Agent Tools and Prompts](docs/ai/tools-and-prompts.md) and
[Pi Worker Integration](docs/ai/pi-worker.md).

## Renderer and Editor

- UI libraries belong only in `src/renderer/`; wrap shared primitives under
  `src/renderer/components/ui/`.
- MDXEditor owns Markdown rich-text, source, and diff modes.
- Keep raw HTML disabled unless CSP and sanitization are explicitly reviewed.
- Assistant Markdown is read-only: do not interpret raw HTML, load remote
  images, or enable links before a narrow reviewed external-link operation.
- Keep `styles.css` as the single renderer stylesheet entry in this order:
  framework, themes, base, workspace, feature styles.
- Define palettes through semantic theme variables; do not scatter palette
  values through feature components.
- Treat `src/shared/theme-contract.ts` as the theme registry and semantic-token
  contract. Do not maintain parallel theme lists.
- Every registered theme must implement the complete contract in
  `src/renderer/styles/themes.css`.
- Feature styles consume semantic variables only. Do not add raw palette colors,
  theme-specific selectors, or duplicated preview palettes outside
  `themes.css`.
- When adding a theme, update its registry metadata, complete palette, settings
  metadata, and localized descriptions together.
- Preserve theme contract tests for token completeness, native-window background
  agreement, critical contrast, and raw-color leakage.
- Preserve native same-document View Transitions for library/Agent pane collapse
  with reduced-motion and unsupported-runtime fallback.

See [Renderer, Editor, and UI](docs/renderer/editor-and-ui.md).

## Internationalization

- English is the default; supported languages are `en` and `zh-CN`.
- The versioned main settings file is the only locale source of truth. Do not use
  browser detection, `localStorage`, HTTP backends, CDNs, or runtime catalog
  fetches.
- Keep catalogs as statically imported TypeScript. English defines the canonical
  shape; every supported locale must remain complete with matching placeholders.
- Bootstrap settings and renderer i18next before the first React render.
- Successful language changes immediately update i18next and document
  `lang`/`dir`; failed persistence leaves the active language unchanged.
- Translate application chrome and accessibility text, not manuscripts,
  filenames, project/provider/model names, user prompts, or model output.
- Send typed error/status codes across IPC, not localized internal exception
  prose.
- Do not localize Agent system prompts through the UI catalog.
- Any user-visible change updates every supported locale and relevant tests in
  the same change.

See [Internationalization](docs/renderer/i18n.md).

## Reliability Requirements

Do not regress these established behaviors:

- navigation/new-window denial and trusted-frame IPC;
- one dirty-document lifecycle across close, switch, refresh, deletion, window
  close, and quit;
- SHA-256 revision conflicts, serialized atomic saves, and recoverable missing
  backing files;
- debounced, revision-deduplicated watcher sessions with health and retry;
- strict metadata validation and stable document identity;
- session-bound Agent cancellation, terminal cancellation races, bounded tools,
  and request-start draft snapshots;
- safe assistant Markdown and packaged Pi/i18n smoke coverage.

Read [Reliability Baseline](docs/reliability.md) before changing these areas.
Current limitations and unfinished work are tracked in
[Technical Debt and Roadmap](docs/roadmap.md); never describe roadmap items as
implemented.

## Package and Build Rules

- Use only pnpm. Use `pnpm add`/`pnpm remove` and commit `pnpm-lock.yaml`.
- Keep `minimumReleaseAge`, `nodeLinker: hoisted`, and reviewed `allowBuilds`
  behavior.
- Do not add root `"type": "module"` without changing and testing the Forge
  CommonJS main/preload strategy.
- Keep `src/main.ts`, `src/preload.ts`, and target-specific `config/vite/`
  configuration aligned with Forge output paths.
- Re-run packaged Pi startup/provider smoke whenever Pi, Electron, Forge, Vite,
  Rolldown, or worker bundling changes.
- Do not force incompatible transitive dependency majors merely to silence a
  build-tool audit.

See [Development and Packaging](docs/development/packaging.md) and
[Pi Worker Integration](docs/ai/pi-worker.md).

## Commands

```bash
pnpm run dev
pnpm test
pnpm run typecheck
pnpm run package
pnpm run make
pnpm run test:packaged-pi
pnpm run test:packaged-i18n
pnpm audit --prod
pnpm audit
```

For structural or security-sensitive work, run at minimum `pnpm test`,
`pnpm run typecheck`, and `pnpm run package`. Run the relevant packaged smoke
scripts whenever AI/Pi, i18n, renderer bundling, ASAR, or packaging is affected.

## Documentation Index

- [Architecture](docs/architecture.md)
- [Project Format](docs/project-format.md)
- [Agent Tools and Prompts](docs/ai/tools-and-prompts.md)
- [Pi Worker Integration](docs/ai/pi-worker.md)
- [Renderer, Editor, and UI](docs/renderer/editor-and-ui.md)
- [Internationalization](docs/renderer/i18n.md)
- [Reliability Baseline](docs/reliability.md)
- [Technical Debt and Roadmap](docs/roadmap.md)
- [Development and Packaging](docs/development/packaging.md)
- [Project Databases](docs/database.md)
