# Technical Debt and Roadmap

This file records current limitations. It is not evidence that a capability is
implemented or authorized.

## Projects and persistence

- Legacy nonempty Markdown folders can open, but there is no reviewed migration
  workflow. A future migration must preview classification, create stable IDs
  and ordered indexes, handle collisions, and never move or rewrite user files
  without approval.
- Project selection, open tabs, unsaved drafts, and Agent conversations are not
  restored after relaunch. Future persistence remains main-owned and starts with
  migrations.
- Watcher retry and close/quit behavior have unit coverage but not complete
  packaged Electron end-to-end coverage on every supported platform.
- YAML comment and exact-format round-trip preservation remains undecided.

## Editor and renderer

- MDXEditor's `autoLoadLanguageSupport` includes the complete CodeMirror dynamic
  language catalog although the UI exposes only JavaScript, JSON, Markdown,
  plain text, and TypeScript. Replace it only with verified explicit language
  support that preserves highlighting in rich-text, source, and diff modes.
- External links have no preload method. If added, route reviewed URLs through a
  narrow validated main handler; never load them in the application window.
- General MDX/JSX remains disabled pending an explicit descriptor, CSP,
  sanitization, and test strategy.

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

## Build and settings

- Review every new `allowBuilds` entry; never approve transitive lifecycle
  scripts merely because pnpm prompts during installation.
- Increment the settings schema and add a migration before incompatible changes.
