# Renderer, Editor, and UI

UI libraries belong only in `src/renderer/`. Wrap shared primitives under
`src/renderer/components/ui/` so features do not depend directly throughout the
application on one library's imports or styling conventions.

Keep application state separate from persisted data:

- Renderer stores own transient UI state and cached views.
- Main services and future repositories remain the source of truth for novels.

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
as GitHub Light, One Dark, or Tokyo Night through feature components.

`src/shared/theme-contract.ts` is the theme registry and declares the complete
set of required semantic CSS variables. Every registered theme must implement
that contract in `styles/themes.css`; feature styles consume semantic variables
or stable component aliases and must not contain raw palette colors or
theme-specific selector branches. Window startup colors and light/dark behavior
are derived from the same registry. Contract tests enforce variable
completeness, startup-background agreement, critical text contrast, and the
absence of palette literals outside the theme stylesheet.

When adding a theme, register its ID, color scheme, and startup background in
the shared contract, add its complete palette block, and add its settings-card
metadata and localized description. Do not copy an existing theme into feature
CSS to handle exceptions; add or refine a semantic role instead.

Keep shared window, pane, and divider geometry in `styles/workspace.css`.
Feature-specific rules belong in the corresponding library, editor, assistant,
or settings stylesheet. Separators are a one-pixel hairline with a wider
invisible drag target; do not restore visible spacer gutters or feature-local
header/footer offsets.

## Pane transitions

Library and Agents collapse controls use the native same-document View
Transitions API, with an immediate fallback for reduced motion or unsupported
runtimes. Do not restore hand-built DOM snapshot overlays.

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
