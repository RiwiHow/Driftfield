# Architecture

Driftfield is a local-first AI novel-writing desktop application built with
Electron, React, TypeScript, Vite, and Electron Forge.

## Process boundaries

- `main` owns windows, files, databases, credentials, model SDKs, and operating
  system integration.
- `preload` exposes a small, typed, allow-listed API through `contextBridge`.
- `renderer` is an unprivileged React application and does not access Node.js,
  Electron internals, the database, or API keys directly.
- `shared` contains pure types and contracts safe in every process. It does not
  import Electron, Node-only modules, React, or database drivers.

## Source layout

```text
src/
├── main.ts                       # Stable Forge main entry
├── main/
│   ├── index.ts                  # Lifecycle and dependency composition
│   ├── ai/                       # AI interface, Pi worker, tools, prompts
│   ├── i18n/                     # Main translator and native UI copy
│   ├── ipc/                      # Validated privileged IPC handlers
│   ├── services/                 # Project, layout, session, settings services
│   └── windows/                  # BrowserWindow and navigation policies
├── preload.ts                    # Stable Forge preload entry
├── preload/                      # contextBridge implementation
├── renderer/
│   ├── app/                      # Workspace composition and view types
│   ├── components/ui/            # Shared UI primitives
│   ├── features/                 # Assistant, editor, library, projects, settings
│   ├── i18n/                     # Renderer i18next setup
│   └── styles/                   # Theme, layout, and feature styles
└── shared/
    ├── contracts/                # Serializable process-boundary contracts
    ├── i18n/                     # Supported languages and catalogs
    └── electron-api.ts           # Typed preload API
```

Extend this architecture instead of introducing a parallel application
structure. Future database code belongs under `src/main/database/`; future pure
domain types, runtime schemas, and serializable errors belong under
`src/shared/`.

Prefer feature-oriented renderer code. Keep `App.tsx` as a composition layer
rather than accumulating project, editor, or assistant business logic there.

## Tests and generated output

All tests live under root `tests/` and mirror `src/main/`, `src/renderer/`, and
`src/shared/`. Do not place `*.test.ts` or `*.test.tsx` under `src/`.
Post-package ASAR and installer checks live under `tests/packaged/`.

The following are generated and are not source code:

- `node_modules/`
- `.vite/`
- `out/`
- `.pnpm-store/`

## IPC

IPC is the application boundary, not an implementation shortcut.

- Put serializable request, response, and event contracts in
  `src/shared/contracts/`.
- Keep channel names centralized.
- Use request identifiers for streamed and cancellable operations.
- Validate privileged payloads at runtime and validate the sender.
- Convert internal failures to small serializable error contracts.
- Never send class instances, functions, Electron objects, database handles,
  SDK sessions, or custom prototypes across IPC.

IPC registration is grouped by domain under `src/main/ipc/`: Agent, project,
settings, and window/editor lifecycle modules each own their handlers, while
`register-ipc-handlers.ts` is composition-only. Keep request validators close to
their IPC domain and retain a registration-completeness test when channels are
added or removed.

## Database

Database drivers belong in `src/main/database/`. Renderer features call typed
preload methods that reach validated main-process handlers and repositories.

Project-owned structured state is split by lifecycle under `.driftfield`:
`project.sqlite` owns identity and future authoritative world state,
`conversations.sqlite` owns Agent history and generation/tool audit records, and
`settings.sqlite` owns project-level model configuration. Global UI settings
and credentials remain under Electron `userData`. Per-project Pi configuration
files under `userData` are rebuildable runtime caches, not authoritative
settings. See [Project Databases](database.md).

- Introduce migrations with the first persisted schema.
- Keep SQL and driver records behind repositories.
- Do not use cross-database foreign keys. Join domains in main-owned services
  through validated stable IDs when a workflow needs them.
- Keep domain types independent of the selected database library.
- Use transactions for multi-record changes.
- Do not expose SQL, handles, repositories, or unrestricted query tools to
  Agents. Expose bounded project-scoped domain operations instead.
- When adding native SQLite, update Electron rebuild and ASAR unpacking and
  verify packaged applications on every supported platform.
