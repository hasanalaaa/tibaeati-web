# Design

Arabic-first (RTL), English second, light and dark. Visual language follows the iOS app
(`Tibaeati/Helpers/Extensions.swift`, `PremiumComponents.swift`): teal accent, soft cards, calm
neutral surfaces.

## Tokens (`src/ui/tokens.css`)

CSS variables on `:root`; the dark set applies through `prefers-color-scheme` unless the user forced
light, or when `data-theme="dark"` is set (Settings > Appearance writes it).

- Color: `--c-bg`, `--c-surface`, `--c-surface-strong`, `--c-border`, `--c-fg`, `--c-fg-muted`,
  `--c-fg-subtle`, `--c-accent`, `--c-accent-soft`, `--c-on-accent`, `--c-success`, `--c-warning`,
  `--c-focus`, `--c-input`, `--c-chrome`. Light accent is `#17777d`, a darker step of the iOS teal
  `#1C898F`, so white button text reaches AA contrast. The brand `#1c898f` is used for the icon and
  the manifest theme color.
- Radius `--r-sm..xl`, spacing `--s-1..7` (4px base), type `--t-xs..3xl`, shadows `--shadow-sm/md/lg`.
- `--touch-min: 44px`, `--content-max: 64rem`, system font stack in `--font-sans` (no web fonts).
- Tailwind v4 maps the tokens in `src/app/index.css` (`@theme inline`), so utilities such as
  `bg-surface`, `text-fg-muted`, `rounded-lg` read the variables.

## Components (`src/ui`)

- `Button` (primary, secondary, ghost), min 44px.
- `IconButton`: round 44px, `label` is required and becomes `aria-label`.
- `Card`: surface with border and shadow; `interactive` adds hover/press feedback.
- `Screen`: page scaffold with a sticky top bar (safe-area aware), optional back button, actions slot.
- `ui` has no app text and no routing: callers pass translated strings.

## Rules

- Logical CSS only: `ps/pe/ms/me`, `start/end`, `text-start`. Never `left/right/pl/pr/ml/mr`.
  Directional icons flip with `rtl:-scale-x-100`.
- Every interactive element is keyboard reachable and shows `.focus-ring` (3px outline).
- Minimum touch target 44 x 44 px.
- `prefers-reduced-motion` disables transitions and animations globally.
- No remote fonts, images or scripts. Text comes from `src/app/i18n`.
- Layout: one column on phones, 2 then 3 columns from `sm`/`lg`, content capped at `--content-max`.
