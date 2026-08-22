# Development and Packaging

pnpm is the only package manager for npm dependencies.

`pnpm test` launches Vitest through Electron's bundled Node runtime so tests
for `node:sqlite` use the exact API version shipped by the application. The
small host-Node launcher must not import application modules before spawning
Electron.

## Package rules

- Use `pnpm add` and `pnpm remove`; do not introduce npm, Deno, Bun, or another
  package manager.
- Commit `pnpm-lock.yaml` and keep `minimumReleaseAge` enabled.
- Keep `nodeLinker: hoisted`; Electron Forge 7 requires a hoisted or explicitly
  hoisted `node_modules` layout.
- `blockExoticSubdeps: false` currently permits Forge 7's pinned Electron
  `node-gyp` Git dependency. Review this on Forge upgrades.
- Forge currently produces macOS DMG and ZIP artifacts. Remove the ZIP maker
  only after release policy explicitly drops ZIP.
- Do not add root `"type": "module"` without changing and testing the Forge 7
  CommonJS main/preload strategy.
- Keep `src/main.ts` and `src/preload.ts` stable unless output paths and
  `package.json.main` change together.
- Keep target-specific Vite configs under `config/vite/`; resolve paths through
  repository root rather than assuming configs remain at root.
- Project persistence uses Electron's bundled `node:sqlite`; do not add a native
  SQLite addon without reviewing Electron rebuild, ASAR unpacking, and packaged
  database smoke coverage.

Forge 7 currently resolves `tar@6.2.1` through `@electron/rebuild` and
`@electron/node-gyp`. Production dependency audits report no known runtime
vulnerabilities, while full audits include legacy build-tool findings. Do not
force `tar@7` across a declared major boundary solely to silence that audit.
Reassess when Forge 8 is stable or Forge 7 updates its rebuild dependency.

## Commands

```bash
pnpm run generate:icon-catalog # Sync the shared catalog after a Lucide upgrade
pnpm run dev                  # Start Vite and Electron
pnpm test                     # Run Vitest once
pnpm run typecheck            # TypeScript without emit
pnpm run package              # Build and package locally
pnpm run make                 # Create DMG/ZIP artifacts
pnpm run test:packaged-pi     # Verify packaged Pi worker/provider discovery
pnpm run test:packaged-i18n   # Verify packaged locale catalogs
pnpm audit --prod             # Audit shipped dependencies
pnpm audit                    # Audit all dependencies
```

`src/shared/contracts/lucide-icon-catalog.generated.ts` is generated from the
installed `lucide-react/dynamicIconImports` keys. Regenerate and commit it with
every Lucide version change; contract tests fail when the generated catalog and
the installed package differ.

For structural or security-sensitive changes, run at minimum:

```bash
pnpm test
pnpm run typecheck
pnpm run package
pnpm run test:packaged-pi     # When AI/Pi or packaging is affected
pnpm run test:packaged-i18n   # When renderer/i18n or packaging is affected
```
