# Renderer, Editor, and UI

UI libraries belong only in `src/renderer/`. Wrap shared primitives under
`src/renderer/components/ui/` so features do not depend directly throughout the
application on one library's imports or styling conventions.

Keep application state separate from persisted data:

- Renderer stores own transient UI state and cached views.
- Main services and future repositories remain the source of truth for novels.

Project workspace state transitions live in
`features/projects/project-workspace-reducer.ts`. Project-session subscriptions
and document/window lifecycle effects use separate hooks; the composition hook
does not duplicate those effects or introduce a global state store.

## Current UI foundation

- Tailwind CSS provides utilities and semantic design tokens.
- shadcn/ui source components live in `src/renderer/components/ui/`; add only
  components that are used.
- Radix UI provides interactive primitives and Lucide provides icons.
- `react-resizable-panels` owns the fixed library/editor/Agents layout.
- MDXEditor owns Markdown rich-text, source, and diff editing modes. Markdown is
  the manuscript interchange format.
- Keep raw HTML processing disabled unless CSP and sanitization are explicitly
  reviewed.
- General MDX/JSX manuscript files are unsupported.

## Styling

Keep `styles.css` as the single renderer stylesheet entry and preserve this
import order:

1. framework styles;
2. themes;
3. base rules;
4. workspace layout;
5. feature styles.

Define themes through semantic variables in `styles/themes.css` and map
library-specific variables onto them. Do not scatter named palette values such
as GitHub Light or GitHub Dark through feature components.

`src/shared/theme-contract.ts` is the theme registry and declares the complete
set of required semantic CSS variables. Every registered theme must implement
that contract in `styles/themes.css`; feature styles consume semantic variables
or stable component aliases and must not contain raw palette colors or
theme-specific selector branches. Window startup colors and light/dark behavior
are derived from the same registry. Contract tests enforce variable
completeness, startup-background agreement, critical text contrast, and the
absence of palette literals outside the theme stylesheet.

The persisted appearance preference may also be `system`. It resolves to one
of the registered light or dark themes: Renderer follows
`prefers-color-scheme`, while Main follows Electron's native theme state for
the window background and native titlebar chrome. A system preference is not a
third palette and must not introduce a separate CSS theme block.

The built-in GitHub Light and GitHub Dark palettes map Driftfield roles from the
official `@primer/primitives` functional light and dark themes. Preserve
Primer's separation between accent interactions and success, attention, and
danger states when changing those mappings. Agent send is an accent interaction,
not a success action.

When adding a theme, register its ID, color scheme, and startup background in
the shared contract, add its complete palette block, and add its settings-card
metadata and localized description. Do not copy an existing theme into feature
CSS to handle exceptions; add or refine a semantic role instead.

Keep shared window, pane, and divider geometry in `styles/workspace.css`.
Feature-specific rules belong in the corresponding library, editor, assistant,
or settings stylesheet. Separators are a one-pixel hairline with a wider
invisible drag target; do not restore visible spacer gutters or feature-local
header/footer offsets.

Window chrome is platform-aware: macOS uses the inset native titlebar, while
Windows overlays native caption controls on the renderer-owned draggable
titlebar and keeps the legacy menu bar hidden until requested with Alt. Reserve
the Windows caption-control area in shared workspace geometry, and derive its
background and symbol colors from the registered theme contract.

## Pane transitions

Library and Agents collapse controls use the native same-document View
Transitions API, with an immediate fallback for reduced motion or unsupported
runtimes. Do not restore hand-built DOM snapshot overlays.

`app/use-workspace-panel-transitions.ts` owns panel refs, collapsed state,
transition setup, interruption, cleanup, and reduced-motion fallback.
`WorkspaceShell.tsx` consumes that hook and remains focused on layout
composition.

Do not capture the loaded MDXEditor or its tall `contenteditable` manuscript as
one large snapshot. Capture the clipped editor surface viewport, stable editor
chrome, and independently centered content such as the empty state separately.
This prevents scaling, flashing, viewport escape, and handoff jumps while panes
resize.

## Assistant Markdown

Assistant replies use a dedicated read-only Markdown path. Raw HTML is not
interpreted, remote images are not loaded, and links remain non-navigable until
a reviewed external-link IPC operation exists.

The Agent panel exposes only implemented actions. Its model selector lives in a
footer aligned with the library and editor status bars. Tool activity is
interleaved with streamed assistant text at the point each call occurs, with
calls and results collapsed by default. Activity payloads come from the typed
worker protocol and remain bounded; the Renderer does not infer Tool state from
model prose.

The panel loads project-scoped conversations through narrow preload methods.
Its history selector can create, switch, rename, and soft-delete conversations;
Renderer state is only a cache of the active Main-owned database record. Editing
an earlier user message creates a new active branch, while editing an assistant
message updates the model-facing persisted transcript.

## Model settings

Project model selection uses two controls: first a configured provider, then a
model filtered to that provider. Do not combine provider and model identity into
one long option label. Changing providers clears the current project model
before a replacement is selected, so reasoning and advanced override controls
cannot silently target the previous provider.

Project model selection and thinking level save immediately. Pi model overrides,
including OpenRouter routing, remain an explicit-save form. The settings footer
must report unsaved advanced changes and save failures instead of describing the
whole model page as automatically saved.

Settings UI ownership is organized under `features/settings/` by responsibility:
`dialog/` composes the category navigation and panels, `interface/` owns global
appearance and behavior controls, `models/` owns credentials and project model
selection, and `model-overrides/` owns the explicit-save override form. Keep
provider routing, thinking-map, compatibility, and header sections isolated under
`model-overrides/sections/`, with reusable fields and pure form transitions kept
separate from those views. New model capabilities should extend the focused owner
instead of growing the dialog composition component.
