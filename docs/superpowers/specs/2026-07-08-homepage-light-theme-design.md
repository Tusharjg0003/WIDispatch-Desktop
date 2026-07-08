# Homepage Light-Theme Restyle — Design

## Context

WIDispatch-Desktop's app shell is dark-themed today (`color-scheme: dark`,
body `#0a0b0f`, dark component-scoped tokens like `.metric { --accent:
#567cff; ... }` in `MetricDashboard.css`). The current homepage
(`frontend/src/pages/HomePage.jsx` + `HomePage.css`) is a minimal full-bleed
dark "brand stage": a centered glowing wordmark ("UTILITY OPTIMO") over a
radial-gradient background with a slowly pulsing orb.

The user has a separate, already-built app module (a government water-utility
dashboard) whose CSS they want to mimic, starting with the homepage. That
reference CSS actually contains two layered designs (later rules override
earlier ones via cascade): an elaborate light KPI dashboard (header, KPI
cards, scenario grid, quick actions, system status, map panel, download
section), followed by a final "SIMPLE POST-LOGIN DASHBOARD" override block
that discards all of that in favor of a plain white background with a
centered, solid-navy, uppercase wordmark and a simple fade-in-up entrance.

Decisions made during brainstorming:

- **Target layout**: the simple centered brand-title design (the final
  override block), not the full KPI dashboard. This matches WIDispatch's
  current homepage *structure* — just relit for light theme.
- **Scope**: homepage only, for now. This is the first step of a broader
  light-theme migration; other pages (Economics, Transmission, Asset
  Registry, etc.) stay dark and are out of scope here.
- **Visual treatment**: match the reference exactly — flat and minimal. No
  radial glow / pulsing orb, no gradient-clip text. Solid navy/dark text on
  white.
- **Token strategy**: extract the new palette into reusable CSS custom
  properties now (not hardcoded inline), so future pages migrating to light
  theme can consume the same tokens instead of re-deriving hex values.

## Scope

In scope:
- `frontend/src/index.css` — add shared light-theme tokens to `:root`.
- `frontend/src/pages/HomePage.css` — full rewrite to light theme.

Out of scope (explicitly not done here):
- Any change to `frontend/src/pages/HomePage.jsx` (no new markup/classes
  needed — reuses existing class names).
- Any other page, the sidebar, the toolbar, or the global dark
  `color-scheme`/body background.
- The full KPI-dashboard layout (header, KPI cards, scenario grid, quick
  actions, system status, map panel, download section) from the reference
  CSS — not used anywhere in this app yet, not part of this design.

## Design

### 1. Shared light-theme tokens (`index.css`)

Existing dark tokens in this codebase are component-scoped (defined on a
class like `.metric`, not on `:root`), so there's no naming collision either
way. The new tokens are added to `:root` since they're meant to be reused
across multiple future pages/components, not just one:

```css
:root {
  /* ... existing font-family / color-scheme rules unchanged ... */

  --light-navy: #1a4a8a;
  --light-navy-dark: #0A2C58;
  --light-bg: #ffffff;
  --light-bg-subtle: #f8fafc;
  --light-border: #e2e8f0;
  --light-ink: #1e293b;
  --light-ink-dim: #64748b;
}
```

`color-scheme: dark` and `body { background: #0a0b0f; color: #e8eaf0; }`
stay as-is — they're global defaults for the still-dark rest of the app.
The homepage overrides its own background locally, same as it does today.

### 2. `HomePage.css` rewrite

Same class names as today (`home-page`, `home-brand-stage`,
`home-brand-title`, `page-transition`, `access-denied-alert`,
`access-denied-alert-content`, `access-denied-alert-close`), so
`HomePage.jsx` requires no changes.

- **`.home-page`**: unchanged positioning/sizing behavior (`position:
  relative; height: 100%; width: 100%;`).
- **`.home-brand-stage`**: flex-centered full-bleed stage, background flat
  `var(--light-bg)` (white). Drop the `::before` pseudo-element and the
  `brand-pulse` keyframes entirely — no glow orb in the flat/minimal
  treatment.
- **`.home-brand-title`**: solid `var(--light-ink)` color (no
  `background-clip: text` / gradient), same fluid sizing
  (`clamp(2.5rem, 9vw, 7rem)`), bold weight, uppercase, wide letter-spacing.
  Entrance animation: fade-in-up from `opacity: 0; translateY(10px)` to
  `opacity: 1; translateY(0)`, matching the reference's
  `utility-optimo-fade-in` keyframe (renamed to fit this file, e.g.
  `home-title-fade-in`).
- **`.access-denied-alert` / `-content` / `-close`**: restyled to the
  reference's light treatment — `#fef2f2` background, `#fecaca` border,
  `#dc2626`/`#7f1d1d` text — since the current dark translucent toast
  (`rgba(40, 16, 18, 0.92)`) would clash with the new white page. Slide-in
  animation (`alert-slide-in`) and close-button behavior unchanged.
- **`.page-transition`**: unchanged (route-enter fade, theme-agnostic).
- **`prefers-reduced-motion` block**: unchanged in intent — extended to also
  disable the new `home-title-fade-in` animation, in addition to the
  existing ones it already covers.

## Testing / Verification

No test suite covers CSS visuals in this repo. Verification is manual:
run the frontend dev server, navigate to the homepage, and visually confirm:
- White background, solid dark-navy centered wordmark, fade-up entrance on
  load.
- No leftover dark styling / glow artifacts.
- Access-denied toast (trigger via a denied-route redirect, or temporarily
  force `showAccessDenied` true) renders in the new light style and is
  legible against the white page.
- Reduced-motion setting suppresses the entrance animation.
- No visual regression on other pages (dark theme untouched).
