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
├── tsconfig.json
├── vite.main.config.mts
├── vite.preload.config.mts
├── vite.renderer.config.mts
└── src/
    ├── main.ts                    # Stable Forge entry; imports main/index.ts
    ├── main/
    │   └── index.ts               # Electron lifecycle and main window
    ├── preload.ts                 # Stable Forge entry; imports preload/index.ts
    ├── preload/
    │   └── index.ts               # contextBridge API implementation
    ├── renderer/
    │   ├── index.html             # Renderer HTML and CSP
    │   ├── main.tsx               # React entry
    │   ├── App.tsx                # Temporary application shell
    │   ├── global.d.ts            # window.driftfield declaration
    │   └── styles.css             # Temporary application styles
    └── shared/
        └── electron-api.ts        # Shared preload API contract
```

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
pnpm run typecheck  # Run TypeScript without emitting files
pnpm run package    # Build and package the local Electron application
pnpm run make       # Create configured distributables such as DMG and ZIP
pnpm audit --prod   # Audit dependencies that can enter the shipped app
pnpm audit          # Audit the complete development and build graph
```

Before handing off a structural or security-sensitive change, run at minimum:

```bash
pnpm run typecheck
pnpm run package
```
