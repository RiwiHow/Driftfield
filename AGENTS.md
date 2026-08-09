# Driftfield Development Guide

## Project Overview

Driftfield is a local-first AI novel-writing desktop application built with
Electron, React, TypeScript, Vite, and Electron Forge. pnpm is the only package
manager for npm dependencies.

Keep the Electron process boundary explicit:

- `main` owns privileged capabilities such as windows, files, databases,
  credentials, model SDKs, and operating-system integration.
- `preload` exposes a small, typed, allow-listed API through `contextBridge`.
- `renderer` is an unprivileged React application and must not access Node.js,
  Electron internals, the database, or API keys directly.
- `shared` contains pure types and contracts that are safe in every process. It
  must not import Electron, Node.js-only modules, React, or database drivers.

## Current Structure

```text
Driftfield/
├── AGENTS.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── forge.config.ts
├── forge.env.d.ts
├── components.json              # shadcn/ui source-generation configuration
├── tsconfig.json
├── config/
│   └── vite/
│       ├── electron.config.mts   # Shared Forge main/preload Vite config
│       ├── agent-worker.config.mts # Native ESM Pi utility-process bundle
│       └── renderer.config.mts   # React, Tailwind, and renderer paths
├── tests/                         # Centralized tests mirroring source areas
│   ├── main/                      # Main services, policies, prompts, and i18n
│   ├── renderer/                  # Renderer policies, state, and i18n
│   ├── shared/                    # Shared contracts and locale parity
│   └── packaged/                  # Post-package ASAR smoke assertions
└── src/
    ├── main.ts                    # Stable Forge entry; imports main/index.ts
    ├── main/
    │   ├── index.ts               # Electron lifecycle and dependency composition
    │   ├── ai/
    │   │   ├── ai-agent-service.ts # Main-owned utility-process and tool bridge
    │   │   └── agent-worker.ts    # ESM-only Pi runtime entry
    │   ├── i18n/                   # Main translator and native dialog copy
    │   ├── ipc/
    │   │   └── register-ipc-handlers.ts # Validated privileged IPC handlers
    │   ├── services/
    │   │   ├── project-layout-service.ts # Versioned YAML project structure
    │   │   ├── project-service.ts # Project scan, revisions, and serialized saves
    │   │   ├── project-session-service.ts # Watcher sessions and recovery
    │   │   └── settings-service.ts # Versioned settings parsing and persistence
    │   └── windows/
    │       ├── main-window.ts     # BrowserWindow creation and navigation hooks
    │       └── navigation-policy.ts # Exact renderer URL allowlist
    ├── preload.ts                 # Stable Forge entry; imports preload/index.ts
    ├── preload/
    │   └── index.ts               # contextBridge API implementation
    ├── renderer/
    │   ├── index.html             # Renderer HTML and CSP
    │   ├── i18n/                  # Renderer i18next initialization
    │   ├── main.tsx               # React entry
    │   ├── App.tsx                # Thin workspace and dialog composition
    │   ├── global.d.ts            # window.driftfield declaration
    │   ├── styles.css             # Renderer CSS entry; imports layers below
    │   ├── app/
    │   │   ├── types.ts           # Renderer-only workspace view types
    │   │   └── WorkspaceShell.tsx # Resizable three-pane application shell
    │   ├── components/ui/         # shadcn-style shared primitives
    │   ├── features/
    │   │   ├── assistant/         # Agent conversation UI
    │   │   ├── editor/            # MDXEditor manuscript workspace
    │   │   ├── library/           # Novel tree and snapshot merge logic
    │   │   ├── projects/          # Project/document/save lifecycle hook
    │   │   └── settings/          # Settings UI and state hook
    │   ├── styles/
    │   │   ├── themes.css         # Tailwind mappings and theme palettes
    │   │   ├── base.css           # Document-level resets and defaults
    │   │   ├── workspace.css      # Window chrome, panes, and resize handles
    │   │   ├── library.css        # Novel library and chapter tree
    │   │   ├── editor.css         # MDXEditor, manuscript, and status bar
    │   │   ├── assistant.css      # Agent conversation and composer
    │   │   └── settings.css       # Settings and conflict dialogs
    │   └── lib/utils.ts           # Shared renderer class-name utility
    └── shared/
        ├── electron-api.ts        # Shared preload API contract
        ├── i18n/                  # Supported languages and bundled catalogs
        └── contracts/             # IPC, project layout, settings, and lifecycle
```

All tests live under the root `tests/` directory and mirror the corresponding
`src/main/`, `src/renderer/`, and `src/shared/` areas. Do not place `*.test.ts`
or `*.test.tsx` files under `src/`. Post-package assertions that inspect ASAR or
installers live under `tests/packaged/` and run through dedicated package scripts.

Generated directories are not source code:

- `node_modules/` contains pnpm-installed dependencies.
- `.vite/` contains development and production Vite bundles.
- `out/` contains Forge packages and installers.
- `.pnpm-store/`, when present locally, is disposable pnpm cache data.

## Intended Growth

Extend the existing directories instead of introducing a second application
architecture:

```text
src/
├── main/
│   ├── windows/                   # BrowserWindow creation and policies
│   ├── ipc/                       # Validated IPC handlers
│   ├── database/                  # Connection, migrations, repositories
│   ├── ai/                        # Stable AI interface and Pi adapter
│   └── services/                  # Export, import, backup, and application jobs
├── preload/
├── renderer/
│   ├── app/                       # Providers, routing, application setup
│   ├── components/ui/             # UI-library wrappers and shared primitives
│   ├── features/                  # Projects, chapters, editor, lore, assistant
│   ├── stores/                    # Renderer state management
│   └── styles/
└── shared/
    ├── domain/                    # Pure domain types
    ├── contracts/                 # IPC request, response, and event contracts
    ├── schemas/                   # Runtime validation schemas
    └── errors/                    # Serializable cross-process errors
```

Prefer feature-oriented renderer code. As the UI grows, split `App.tsx` into
features rather than accumulating business logic in the root component.

## Security Invariants

Do not weaken these settings in `BrowserWindow.webPreferences`:

```ts
contextIsolation: true
nodeIntegration: false
sandbox: true
```

Additional requirements:

- Never expose `ipcRenderer` or a generic `send` function through preload.
- Define one narrow preload method per supported operation.
- Validate IPC payloads at runtime and validate the sender of privileged calls.
- Keep API keys and OAuth tokens out of renderer state, local storage, logs, and
  source control. Store and use them in the main process.
- Keep database access in the main process. Store mutable application data under
  `app.getPath('userData')`, never inside the application bundle or ASAR.
- Do not load remote pages into the privileged main window.
- Keep the renderer CSP restrictive and explicitly review every new source.
- Deny unexpected navigation and new windows. Open reviewed external URLs through
  a narrow main-process handler.
- Do not silently overwrite novel text with generated output. Generated content
  must be previewable, cancellable, and recoverable.

## IPC Conventions

IPC is the application boundary, not an implementation shortcut.

- Put serializable request, response, and event types in `src/shared/contracts/`.
- Keep channel names centralized; do not scatter string literals across files.
- Use request identifiers for streamed and cancellable operations.
- Convert internal errors to a small serializable error contract.
- Do not send class instances, custom prototypes, functions, Electron objects,
  database handles, or SDK session objects across IPC.

## Database Conventions

Database drivers belong in `src/main/database/`. Renderer features call typed
preload methods, which call validated main-process handlers and repositories.

- Introduce migrations from the first persisted schema.
- Keep SQL and driver-specific records behind repositories.
- Do not expose SQL, database handles, repository instances, or unrestricted
  query tools to Agents. Expose bounded, project-scoped novel-domain operations
  through main-process services instead.
- Keep domain types independent from the chosen database library.
- Use transactions for multi-record document changes.
- When adding a native SQLite module, update Electron rebuild and ASAR unpacking
  configuration and verify packaged applications on every supported platform.

## Project Structure and Metadata

A Driftfield project is a portable, versioned folder format. New-format projects
require one root manifest and one lowercase manuscript root. The lowercase
lorebook root is optional and is created only when the project uses it:

```text
novel/
├── driftfield.yaml
├── manuscript/
│   └── _index.yaml
└── lorebook/                    # Optional
    └── _index.yaml
```

- Keep the required physical manuscript root exactly `manuscript`. When present,
  keep the optional physical lorebook root exactly `lorebook`. Treat their
  spelling and lowercase casing as part of the project format; UI labels are
  separate, user-authored metadata and may be localized or renamed without
  changing the physical paths. A missing `lorebook/` means the project has not
  created a lorebook yet and must not prevent the manuscript from opening.
- Use `driftfield.yaml` only at the project root to identify the project, carry
  its stable project ID, and declare the overall project-format version. Do not
  repeat the format version in every directory index.
- Use `_index.yaml` for metadata in each semantic directory. An index owns that
  directory's stable ID, kind, display title, child ordering, and any inherited
  child-label or numbering policy. Do not duplicate the same metadata in both a
  parent and child index.
- Keep Markdown files as content. Do not use filenames, paths, display titles,
  volume/chapter numbers, or array positions as stable domain identity.
- A directory's `title` controls its own UI label. A constrained `format`
  controls child labels only. Formatters are data templates, never executable
  code: allow only documented placeholders, reject unknown placeholders, bound
  their size, and never allow expressions, property traversal, environment
  access, custom YAML tags, or formatter-derived file paths or IDs.
- Store ordering explicitly in index `children` arrays rather than inferring it
  from lexical filenames. Keep numbering behavior structured and separate from
  formatting, with supported modes such as continuous, per-volume, manual, and
  none.
- Parse YAML in main with a safe schema and strict runtime validation. Bound file
  size, nesting, aliases, collection size, string size, and child count; reject
  unsupported keys and kinds. Canonicalize and contain every referenced path
  below its owning project and semantic root.
- Main-process project services own project initialization, metadata reads,
  migrations, revision checks, serialized atomic writes, and conflict handling.
  Renderer features and Agent workers must not parse, mutate, or construct
  project metadata paths themselves.
- Agents access structure through bounded domain tools and stable IDs. They must
  never edit YAML directly; structural changes follow the same propose, preview,
  approve, revision-check, and main-owned apply flow as manuscript changes.
- Whether application writes must preserve user-authored YAML comments and exact
  formatting is intentionally undecided. Do not promise round-trip comment
  preservation until that product decision and parser strategy are explicit.

## AI and Pi Integration

Pi or another model SDK belongs behind an application-owned interface in
`src/main/ai/`. SDK-specific types must not leak into renderer features or shared
domain types.

- Prefer the `@earendil-works/pi-coding-agent` SDK behind a Driftfield-owned
  adapter instead of depending directly on `pi-agent-core`. The Electron main
  bundle remains CommonJS; load Pi only inside the separately built native ESM
  `agent-worker.mjs` Electron utility process.
- Keep credentials and provider calls in the privileged backend. Main owns the
  application credential paths and process lifecycle; the Pi utility process may
  read only its application-owned auth/model files and must never expose their
  paths or contents to preload or renderer.
- Keep filesystem, project, and future database authority in main-process
  services. Pi custom tools request bounded domain operations over the internal
  utility-process protocol; do not give the worker database handles or generic
  filesystem tools.
- Stream typed deltas to the renderer through cancellable IPC operations.
- Prefer narrowly defined novel-writing tools over generic shell or filesystem
  tools.
- Do not enable Pi coding tools by default.
- Keep Electron main and preload on the Forge 7 CommonJS strategy and shared
  `config/vite/electron.config.mts`. Split that config only when the targets
  genuinely need different build behavior. Do not restore
  the former `import.meta.url` text transform or package the complete production
  `node_modules` tree to make Pi load from main.
- The ESM worker build defines `require` with Node's
  `createRequire(import.meta.url)` for Pi's CommonJS transitive dependencies that
  still call bare `require()` for Node built-ins. This is Node's supported ESM to
  CommonJS interoperability mechanism, not an `import.meta.url` text rewrite.
  Vite/Rolldown currently emits multiple ESM chunks, so the worker-only build
  banner supplies the same lexical `require` to every output chunk that may
  contain a CommonJS wrapper. Do not move this banner to the main or preload
  builds, treat it as a general bundling convention, or use it as permission to
  import Pi from the CommonJS main bundle.
- Reassess and remove the worker `createRequire` banner when Pi and its
  transitive dependencies become fully ESM, or when Vite/Rolldown reliably
  converts their external Node built-in imports. Re-run the packaged-ASAR worker
  startup smoke test whenever Pi, Electron, Forge, Vite, or Rolldown is upgraded.
- An Electron utility process is an isolation and lifecycle boundary, not a
  security sandbox. The availability of `require` does not permit untrusted Pi
  extensions, arbitrary resource discovery, generic code execution, shell
  tools, or unrestricted filesystem/database tools.
- Persist application-owned generation records independently from SDK session
  formats so the SDK can be upgraded or replaced.
- Keep application system prompts under `src/main/ai/prompts/` as versioned,
  application-owned role profiles. Compose immutable application boundaries,
  role instructions, and cross-tool usage policy through the prompt registry;
  do not embed complete prompts in the worker entry or allow renderer-supplied
  arbitrary system prompts. Keep each tool's name, description, and parameter
  schema in its `defineTool()` registration as the single source of truth; do
  not duplicate per-tool descriptions in the system prompt. Whenever a tool is
  added, removed, or its semantics change, explicitly review and, when needed,
  update the cross-tool policy in `src/main/ai/prompts/prompt-builder.ts`. Bump
  the affected prompt profile versions whenever that review changes model-facing
  prompt behavior. Future user writing instructions may be size-bounded
  additions but must not replace application boundaries.

### Agent Coordination

Use one application-owned coordinator Agent to interpret the user's goal,
decompose work, start and cancel specialist Agent sessions, collect their
results, and prepare the final proposal. The coordinator is an orchestrator, not
an authority that can bypass persistence, permission, or review boundaries.

- Give each specialist Agent only the minimum context required for its role.
  Do not copy the coordinator's complete transcript into every child session.
- Use specialist roles such as continuity, plot, style, research, and editing
  when they provide distinct context or output. Do not create multiple Agents
  merely to duplicate the same reasoning.
- Return typed, application-owned results from specialist Agents. Include task,
  parent request, document, and base-revision identifiers where applicable; do
  not pass Pi session objects or raw SDK events between application layers.
- Propagate cancellation from renderer to coordinator and child sessions. Bound
  concurrency, context size, tool-call count, and output size per request.
- Treat child results as untrusted proposals. The coordinator may reconcile or
  summarize them but may not represent a proposal as persisted until the main
  process confirms the write.

### Agent Data Access

Agents read persisted novel data only through bounded custom tools implemented
by main-process services and repositories. Prefer domain operations such as
`getChapter`, `getChapterSummary`, `searchNovelContext`, `getCharacter`,
`getTimeline`, and `getOutline` over generic database access.

- Validate project and document scope on every tool call and limit result size.
- Keep schema details, SQL, migrations, and driver records behind repositories.
- Allow the context service to combine canonical records, full-text or vector
  search, and cached summaries without changing Agent-facing contracts.
- Keep canonical novel data, derived Agent memory or indexes, and generation
  audit records logically separate. Generated summaries are not canonical facts
  unless the application explicitly promotes them.

### Agent Markdown Changes

Agents may generate a complete Markdown document or propose edits at character,
word, line, paragraph, or section granularity, but they must not write files
directly. All generated mutations follow a propose, preview, approve, and apply
flow through the existing project services.

- A create proposal contains the complete Markdown content and a validated
  application-relative destination. The main process enforces supported
  extensions, canonical containment, size limits, and non-overwrite behavior.
- An edit proposal identifies the document and its SHA-256 `baseRevision`, and
  carries application-owned structured replacements or a patch against that
  exact revision. Prefer stable exact-text anchors or ranges in the base snapshot
  over bare line numbers, which drift during editing.
- Render a diff or equivalent preview before application. The user must be able
  to accept, reject, or selectively apply generated changes and cancel ongoing
  generation.
- Apply accepted edits through `ProjectService` so revision checks, serialized
  saves, unique temporary files, conflict handling, and recovery remain intact.
  Never let an Agent call a lower-level filesystem write path.
- If the disk revision changed, stop the apply operation and enter the existing
  conflict workflow or ask the Agent to re-read the latest document. Never guess
  at a merge or silently overwrite novel text.
- Persist the prompt, relevant model metadata, tool activity, proposal, approval
  decision, and resulting revision as application-owned generation records so
  changes remain traceable and recoverable.

## UI Conventions

UI libraries belong exclusively in `src/renderer/`. Wrap shared primitives under
`src/renderer/components/ui/` so feature code does not depend everywhere on one
library's imports or styling conventions.

Keep application state separate from persisted data:

- Renderer stores manage transient UI state and cached views.
- The main process and database remain the source of truth for persisted novels.

## Internationalization (i18n)

Driftfield is an English-default application. Users may change the application
language in Settings without restarting. The initial supported languages are
`en` and `zh-CN`; add a language only when its complete catalog and tests land
together.

Use `i18next` as the shared translation engine and `react-i18next` in the
renderer. Add both as direct pnpm dependencies. Do not add a browser language
detector, HTTP translation backend, translation CDN, or `localStorage` locale.
Driftfield is local-first and the versioned main-process settings file is the
only source of truth for the selected language.

### Locale Contract and Persistence

- Add `APP_LANGUAGES = ['en', 'zh-CN'] as const`, an `AppLanguage` type, and
  `language: AppLanguage` to `AppSettings`.
- Increment the settings schema version and add a migration. New and existing
  settings without a valid language migrate to `en`.
- Validate language updates in main like every other setting. Never accept an
  arbitrary locale identifier from renderer IPC.
- The language selector uses self-names that remain recognizable in every UI
  language: `English` and `简体中文`.
- Changing language must immediately update the renderer, `documentElement.lang`,
  and `documentElement.dir`. Derive direction from i18next even though the first
  two languages are LTR, so future RTL support does not require a redesign.
- Application language controls application chrome only. It must not translate
  manuscript content, project filenames, provider/model names, user prompts, or
  model output. Agent replies continue to follow the user's request language.

### Resource Ownership and Structure

Keep locale resources as statically imported TypeScript data so they are
available offline, included in the packaged ASAR, covered by TypeScript, and do
not require CSP or network changes:

```text
src/
├── shared/i18n/
│   ├── languages.ts             # supported IDs, labels, validation
│   ├── resources.ts             # bundled resources and resource types
│   └── locales/
│       ├── en.ts                # canonical/source catalog
│       └── zh-CN.ts             # complete Simplified Chinese catalog
├── main/i18n/
│   └── main-i18n.ts             # non-React translator for native main UI
└── renderer/i18n/
    └── index.ts                 # renderer i18next + initReactI18next instance
```

Organize each locale by feature namespaces such as `common`, `settings`,
`library`, `editor`, `assistant`, `projects`, and `errors`. Use stable semantic
keys such as `assistant.status.starting`, not English source text as the key.
English is the canonical catalog shape; make every other locale satisfy a
deeply widened TypeScript shape derived from English so missing or structurally
incorrect keys fail typecheck. Keep interpolation placeholders identical across
locales.

Configure both i18next instances with bundled resources, `fallbackLng: 'en'`,
the explicit `supportedLngs`, and no missing-key network writes. Use proper
i18next interpolation and pluralization rather than concatenating translated
fragments. Use `Intl` with the resolved application language for future date,
number, and list formatting.

### Renderer Initialization and Usage

- Bootstrap settings before the first React render, initialize renderer i18next
  with the stored language, then mount the app. Do not render Chinese or English
  first and switch after mount; that creates a visible locale flash.
- If settings bootstrap fails, initialize with `DEFAULT_APP_SETTINGS.language`
  (`en`) and surface the existing settings error after mount.
- Feature components use `useTranslation(<namespace>)`. Non-component renderer
  helpers receive translated text, a `TFunction`, or return stable application
  codes; they must not import a mutable global translator casually.
- After a successful language settings update, await `i18n.changeLanguage()`
  and update the document language/direction. Failed persistence must leave the
  active language unchanged.
- Translate all visible copy plus `aria-label`, `title`, placeholder, tooltip,
  empty-state, status, error, and confirmation text. Brand names, provider/model
  names, keyboard shortcut glyphs, and user/project data remain unchanged.
- Feed MDXEditor's `translation` prop from the active editor namespace instead
  of keeping a Chinese translation object inside `ManuscriptEditor.tsx`.
- Do not use `<Trans>` for plain text. Reserve it for messages that genuinely
  contain React elements; keep ordinary strings in `t()` calls.

### Main Process and IPC Boundary

Create a separate non-React i18next instance for main-owned native UI. Main
dialogs, file pickers, notifications, and custom menu labels translate using
the current `settingsService.get().language` at the moment they are shown, so a
language change does not require restarting or synchronizing mutable renderer
state back into main.

Do not send already-localized error prose across IPC. Evolve renderer-visible
errors and statuses toward small typed application error/status codes plus
serializable interpolation parameters; renderer maps those codes to its locale
keys. SDK, filesystem, and internal exception strings are for logs and must not
be displayed directly. Main may translate text that it owns and displays itself
in a native Electron dialog. Electron menu items based solely on built-in
`role` values should retain Electron/OS localization; translate only custom menu
labels.

Preload exposes no translator, locale resource, generic i18n IPC method, or
language mutation separate from the existing validated settings API.

### Catalog and Migration Rules

- Move existing user-visible Chinese literals into `zh-CN`; write reviewed
  English equivalents in `en`. Do not use machine-generated placeholder English
  or leave a mixed-language screen.
- Keep developer logs and internal invariant/error messages in English unless
  they are intentionally mapped to a user-visible application code.
- Do not localize Agent system prompts through the UI catalog. Prompt profiles
  remain versioned application behavior under `src/main/ai/prompts/`; UI locale
  and model-response language are separate concerns.
- A pull request adding or changing user-visible behavior updates every locale
  in the same change. Do not rely on English fallback as a substitute for a
  completed supported-language catalog.

Add focused tests for settings migration and validation, locale key parity,
interpolation placeholder parity, renderer language switching, document
`lang`/`dir`, main native-dialog translation, and the MDXEditor translation
adapter. Keep at least one packaged smoke assertion proving both catalogs are in
the ASAR and no runtime network fetch is required.

The current UI foundation is intentionally small:

- Tailwind CSS provides utility styles and semantic design tokens.
- shadcn/ui source components live under `src/renderer/components/ui/`; add only
  components that are actually used.
- Radix UI provides interactive primitives and Lucide provides icons.
- `react-resizable-panels` owns the fixed library/editor/Agents split layout.
- Library and Agents collapse controls use the native same-document View
  Transitions API for synchronized, compositor-backed sliding, with an immediate
  fallback for reduced motion or unsupported runtimes. Do not reintroduce
  hand-built DOM snapshot overlays for these transitions. Do not capture the
  loaded MDXEditor or its tall `contenteditable` manuscript node as one large
  snapshot: capture the clipped editor surface viewport, stable editor chrome,
  and independently centered content such as the empty state separately so
  resizing cannot scale, flash, escape its scroll viewport, or jump at handoff.
- MDXEditor owns Markdown rich-text, source, and diff editing modes. Markdown is
  the intended manuscript interchange format.

Keep `styles.css` as the single renderer stylesheet entry and preserve its import
order: framework styles, themes, base rules, workspace layout, then feature
styles. Define application themes through semantic CSS variables in
`styles/themes.css` and map library-specific variables onto them. Keep shared
window and panel rules in `styles/workspace.css`; place feature-specific rules in
the matching library, editor, or assistant stylesheet. Do not scatter GitHub
Light, One Dark, Tokyo Night, or other palette values through feature components.
Keep shared pane dimensions and divider geometry in semantic variables under
`styles/workspace.css`. Panel separators render as a one-pixel hairline with a
wider invisible drag target; do not reintroduce visible spacer gutters or
feature-local header/footer offsets.

New-format projects use `driftfield.yaml`, a fixed `manuscript/` root, an optional
`lorebook/` root, and hierarchical `_index.yaml` metadata. Selecting an empty
folder safely initializes the manifest and manuscript structure without creating
an unused lorebook. Nonempty folders without a manifest remain available through
temporary legacy scanning and are never moved or rewritten implicitly.
The project tree reads manuscript Markdown through narrow main-process IPC, and
existing `.md` and `.markdown` documents can be saved back through a validated,
conflict-aware save handler. General `.mdx`/JSX files are not supported. Project
selection, open-document state, unsaved edits, and Agent conversations are still
session-only. Do not describe those parts as restored or persisted. Keep raw HTML
processing disabled in MDXEditor unless the CSP and sanitization strategy are
explicitly reviewed.

## Current Reliability Baseline

The earlier priority 0–3 prototype debt has been remediated. Preserve these
properties when extending the affected subsystems:

- The main window denies new windows, unexpected `will-navigate` events, and
  redirects away from the exact development or packaged renderer URL. Privileged
  IPC also verifies the application-owned main frame and its current URL.
- One dirty-document lifecycle covers tab close, project switch and refresh,
  external deletion or rename, window close, and application quit. Destructive
  paths require an explicit save, discard, or cancel decision.
- Loaded documents carry a SHA-256 disk revision. Main-process saves compare the
  current disk revision and return typed saved, conflict, or missing results.
  Conflict UI exposes reload, compare/merge, and reviewed overwrite paths.
- Dirty documents whose backing file disappears remain recoverable in the
  renderer instead of being dropped by watcher snapshots.
- Recursive `fs.watch` remains only a change signal. Watcher sessions debounce
  and revision-deduplicate scans, report health to the renderer, retain manual
  refresh, and retry after failures.
- Main-process saves are serialized per document, use unique temporary files,
  and validate sender identity, request size, supported extension, canonical
  containment, and regular-file status.
- New-format project metadata is parsed and strictly validated in main. Physical
  root and index casing, regular-file and non-symlink constraints, stable-ID
  uniqueness, bounded YAML, explicit child order, safe formatter placeholders,
  and referenced Markdown entries are checked before a snapshot is exposed.
  Project sessions map stable document IDs to validated relative paths instead
  of treating IDs as filesystem paths.
- Main-process responsibilities are separated across `windows/`, `ipc/`, and
  `services/`. Renderer project and settings state live in feature hooks; root
  `App.tsx` remains a composition layer.
- Settings use schema version 3 and migrate earlier unversioned and versioned
  shapes, including English-default language and Agent settings.
- Agent requests are bound to application-owned project-session identifiers.
  Project switches cancel the owning request, and late worker output or tool
  calls from an obsolete session are rejected. Cancellation remains terminal
  when completion or streamed output races with the cancel request.
- The first Agent data surface consists only of `get_novel_structure`,
  `get_current_document`, and `get_document`. Main validates their typed
  arguments, resolves stable IDs through the active project session, rechecks
  document containment and regular-file status, and enforces per-request call,
  timeout, individual-result, and cumulative-result budgets. These tools never
  expose physical project paths or raw YAML.
- Agent requests capture a size-bounded immutable editor draft with its stable
  document ID and disk base revision. `get_current_document` reads that snapshot,
  including unsaved edits; `get_document` deliberately reads persisted content.
  Pi uses the application-owned Agent data directory as its working directory,
  never the opened novel folder.
- Assistant replies render through a dedicated read-only Markdown path. Raw
  HTML is not interpreted, remote images are not loaded, and links remain
  non-navigable until a reviewed external-link IPC operation exists.
- The packaged Pi smoke test starts `agent-worker.mjs` directly from the
  packaged ASAR and verifies local model discovery for every API-key provider
  exposed by Driftfield without making billable provider requests.
- Vitest covers path containment, project scanning, revision conflicts, settings
  parsing and migration, project-layout initialization and strict YAML validation,
  stable document identity, formatter-driven ordering and labels, dirty-action
  decisions, snapshot merges, navigation policy, Agent run/protocol state,
  cancellation races, project invalidation, credential-state failures, worker
  restart, tool timeouts and budgets, targeted Agent document reads, path-free
  structure results, safe Agent Markdown, locale parity and switching,
  native dialog options, and MDXEditor initialization and translation adapters.

## Remaining Technical Debt

- Nonempty legacy Markdown folders can still be opened, but no reviewed migration
  workflow exists yet. Add an explicit previewable migration that classifies
  manuscript and lorebook files, creates stable IDs and ordered indexes, handles
  collisions, and never moves or rewrites user files without approval. Remove
  legacy scanning only after that migration path is shipped.
- MDXEditor's current CodeMirror configuration enables
  `autoLoadLanguageSupport`, which causes the packaged renderer to include the
  complete `@codemirror/language-data` dynamic language catalog even though the
  UI exposes only JavaScript, JSON, Markdown, plain text, and TypeScript. Replace
  this with explicitly preloaded support for the exposed languages when doing so
  can preserve code-block highlighting and source/diff editing. Do not merely
  disable auto-loading and silently remove syntax highlighting; verify the
  renderer asset list and all three editor modes after the change.
- The Pi utility-process bundle currently includes provider adapters beyond the
  API-key providers exposed by Driftfield because the SDK public entry imports
  the broader runtime. Treat this as a bundle-optimization issue, not permission
  to edit or remove SDK internals. Reduce it only through a supported narrower
  Pi entry point or reliable bundler tree-shaking, while preserving all exposed
  providers and re-running packaged worker startup and provider smoke tests.
- The current Pi integration is a prototype, not a completed Agent subsystem.
  Do not describe it as production-ready until the following issues are
  resolved:
  - API-key provider credentials, explicit model selection, and thinking level
    now have application UI, validated IPC, and main-owned persistence. OAuth
    provider flows are not implemented yet.
  - Read-tool calls and returned context are bounded, but streamed Agent output,
    model input context, and monetary cost do not yet have complete
    application-owned budgets or typed terminal reasons. Add those limits before
    enabling general use.
  - Pi now runs in a separately bundled native ESM Electron utility process and
    the Forge CommonJS main no longer rewrites `import.meta.url`. Packaged startup
    and local provider-discovery smoke coverage exists, but real upstream
    credential rejection, rate limits, network failures, full packaged request
    and cancellation lifecycles, and provider API smoke tests still lack focused
    automated coverage. Do not enable Pi extensions, untrusted resource
    discovery, module-relative assets, or broader tools until the corresponding
    packaged and security coverage exists.
  - Review every new `allowBuilds` entry in `pnpm-workspace.yaml`; do not approve
    transitive lifecycle scripts merely because pnpm prompts during installation.
- There is no external-link preload method yet. If reviewed external URLs are
  introduced, route them through a narrow validated main-process handler; never
  load them into the application window.
- Project selection, open tabs, unsaved drafts, and Agent conversations are not
  restored after relaunch. A future persistence layer must keep the main process
  as the source of truth and introduce migrations from its first schema.
- Watcher retry and close/quit behavior have focused unit coverage but not full
  packaged Electron end-to-end coverage. Verify packaged builds on every
  supported platform before describing manuscript workflows as production-ready.
- General MDX/JSX support remains intentionally disabled pending an explicit
  descriptor, CSP, sanitization, and test strategy.
- Increment the settings schema version and add a migration before making a
  non-backward-compatible settings change.

## Package and Build Rules

- Forge currently produces both macOS DMG and ZIP artifacts. Remove
  `@electron-forge/maker-zip` and its maker configuration only after the release
  policy explicitly drops ZIP distribution; package size alone is not enough to
  infer that product decision.
- Use `pnpm add` and `pnpm remove`; do not mix npm, Deno, Bun, or another package
  manager into this repository.
- Commit `pnpm-lock.yaml` and keep `minimumReleaseAge` enabled.
- Keep `nodeLinker: hoisted`; Electron Forge 7 requires a hoisted or explicitly
  hoisted `node_modules` layout.
- `blockExoticSubdeps: false` currently permits Forge 7's pinned Electron
  `node-gyp` Git dependency. Review this when upgrading Forge.
- Do not add a root `"type": "module"` without also changing and testing the
  Forge 7 CommonJS main/preload output strategy.
- Keep `src/main.ts` and `src/preload.ts` as stable entry filenames unless the
  corresponding output paths and `package.json.main` are changed together.
- Keep target-specific Vite configs under `config/vite/`; paths derived from a
  config file location must resolve through the repository root rather than
  assuming the config itself remains at the root.

The current Forge 7 development toolchain resolves `tar@6.2.1` through
`@electron/rebuild` and `@electron/node-gyp`. `pnpm audit --prod` reports no known
runtime vulnerabilities; full audits report build-time findings in this legacy
toolchain. Do not force `tar@7` across the declared major-version boundary only
to silence the audit. Reassess this note when Forge 8 becomes stable or Forge 7
updates its rebuild dependency.

## Commands

```bash
pnpm run dev        # Start Vite and Electron in development mode
pnpm test           # Run the Vitest unit suite once
pnpm run test:packaged-i18n # Verify bundled en/zh-CN catalogs after packaging
pnpm run typecheck  # Run TypeScript without emitting files
pnpm run package    # Build and package the local Electron application
pnpm run make       # Create configured distributables such as DMG and ZIP
pnpm audit --prod   # Audit dependencies that can enter the shipped app
pnpm audit          # Audit the complete development and build graph
```

Before handing off a structural or security-sensitive change, run at minimum:

```bash
pnpm test
pnpm run typecheck
pnpm run package
pnpm run test:packaged-i18n
```
