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
├── vite.preload.config.mts
├── vite.renderer.config.mts
└── src/
    ├── main.ts                    # Stable Forge entry; imports main/index.ts
    ├── main/
    │   ├── index.ts               # Electron lifecycle and dependency composition
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
- Keep domain types independent from the chosen database library.
- Use transactions for multi-record document changes.
- When adding a native SQLite module, update Electron rebuild and ASAR unpacking
  configuration and verify packaged applications on every supported platform.

## AI and Pi Integration

Pi or another model SDK belongs behind an application-owned interface in
`src/main/ai/`. SDK-specific types must not leak into renderer features or shared
domain types.

- Keep credentials and provider calls in the main process.
- Stream typed deltas to the renderer through cancellable IPC operations.
- Prefer narrowly defined novel-writing tools over generic shell or filesystem
  tools.
- Do not enable Pi coding tools by default.
- If the full Pi coding-agent runtime needs extensions, resource discovery, or
  broad tools, isolate it in an Electron utility process or child process.
- Persist application-owned generation records independently from SDK session
  formats so the SDK can be upgraded or replaced.

## UI Conventions

UI libraries belong exclusively in `src/renderer/`. Wrap shared primitives under
`src/renderer/components/ui/` so feature code does not depend everywhere on one
library's imports or styling conventions.

Keep application state separate from persisted data:

- Renderer stores manage transient UI state and cached views.
- The main process and database remain the source of truth for persisted novels.

The current UI foundation is intentionally small:

- Tailwind CSS provides utility styles and semantic design tokens.
- shadcn/ui source components live under `src/renderer/components/ui/`; add only
  components that are actually used.
- Radix UI provides interactive primitives and Lucide provides icons.
- `react-resizable-panels` owns the fixed library/editor/Agents split layout.
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
