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
├── vite.main.config.mts
├── vite.agent-worker.config.mts  # Native ESM Pi utility-process bundle
├── vite.preload.config.mts
├── vite.renderer.config.mts
└── src/
    ├── main.ts                    # Stable Forge entry; imports main/index.ts
    ├── main/
    │   ├── index.ts               # Electron lifecycle and dependency composition
    │   ├── ai/
    │   │   ├── ai-agent-service.ts # Main-owned utility-process and tool bridge
    │   │   └── agent-worker.ts    # ESM-only Pi runtime entry
    │   ├── ipc/
    │   │   └── register-ipc-handlers.ts # Validated privileged IPC handlers
    │   ├── services/
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
        └── contracts/             # IPC channels, projects, settings, lifecycle
```

Focused Vitest files are colocated with the main-process services, window
policies, and renderer merge/lifecycle helpers they cover.

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
- Keep Electron main and preload on the Forge 7 CommonJS strategy. Do not restore
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
  role instructions, and the exact enabled tool descriptions through the
  prompt registry; do not embed complete prompts in the worker entry or allow
  renderer-supplied arbitrary system prompts. Future user writing instructions
  may be size-bounded additions but must not replace application boundaries.

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

The project tree currently reads Markdown files through narrow main-process IPC,
and existing `.md` and `.markdown` documents can be saved back through a
validated, conflict-aware save handler. General `.mdx`/JSX files are not
supported. Project selection, open-document state, unsaved edits, and Agent
conversations are still session-only. Do not describe those parts as restored
or persisted. Keep raw HTML processing disabled in MDXEditor unless the CSP and
sanitization strategy are explicitly reviewed.

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
- Main-process responsibilities are separated across `windows/`, `ipc/`, and
  `services/`. Renderer project and settings state live in feature hooks; root
  `App.tsx` remains a composition layer.
- Settings use schema version 1 and migrate the earlier unversioned shape.
- Vitest covers path containment, project scanning, revision conflicts, settings
  parsing and migration, dirty-action decisions, snapshot merges, navigation
  policy, and MDXEditor initialization callbacks.

## Remaining Technical Debt

- The current Pi integration is a prototype, not a completed Agent subsystem.
  Do not describe it as production-ready until the following issues are
  resolved:
  - There is no application UI or narrow IPC flow for provider credentials,
    OAuth, model selection, or thinking level. Packaged applications cannot rely
    on terminal environment variables, and error messages must not direct users
    to settings that do not exist.
  - The current-document tool scans the whole project and reads the on-disk copy,
    so it is both unnecessarily expensive and stale when the active manuscript
    has unsaved edits. Introduce a validated targeted read service and an
    explicit, size-bounded draft snapshot contract carrying document and revision
    identity.
  - Agent requests are not invalidated when their project is switched. Bind each
    request to an application-owned project-session identifier and cancel or
    reject output and tool calls after that session changes.
  - Model selection currently takes the first available model. Persist and
    validate an explicit provider, model, and thinking-level selection instead
    of depending on SDK ordering.
  - Agent output, context size, tool-call count, and cost are not yet bounded as
    application policy. Add limits and typed terminal reasons before enabling
    general use.
  - Assistant output is rendered as plain paragraph text rather than reviewed
    Markdown, and cancellation/start failures leave incomplete UI states. Add a
    safe Markdown presentation path and explicit starting, cancelling, cancelled,
    failed, and completed states.
  - Pi now runs in a separately bundled native ESM Electron utility process and
    the Forge CommonJS main no longer rewrites `import.meta.url`. Add packaged
    startup and provider smoke tests before enabling Pi extensions, untrusted
    resource discovery, module-relative assets, or broader tools.
  - The Agent IPC and utility-process protocol validators, cancellation races,
    project invalidation, credential failures, worker restart, tool timeouts, and
    packaged Pi startup do not have focused automated coverage yet.
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
```
