# Homepage Light-Theme Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `HomePage.css` from the current dark full-bleed "brand stage" to a flat, minimal, light theme (white background, solid navy centered wordmark), matching the "SIMPLE POST-LOGIN DASHBOARD" override block from the reference CSS, while introducing reusable light-theme CSS tokens for future pages to adopt.

**Architecture:** Two-file change. `index.css` gains a small set of `--light-*` custom properties on `:root`, additive to the existing dark-theme defaults (which stay untouched — `color-scheme: dark` and the dark `body` background continue to apply globally). `HomePage.css` is rewritten to consume those tokens; `HomePage.jsx` is untouched since all existing class names (`home-page`, `home-brand-stage`, `home-brand-title`, `access-denied-alert`, etc.) are preserved.

**Tech Stack:** React 18 + Vite frontend, plain CSS (no CSS-in-JS, no preprocessor). No CSS test tooling in this repo — verification is `npm run build` (catches syntax errors) plus manual visual check via `npm run dev`.

## Global Constraints

- No changes to `frontend/src/pages/HomePage.jsx` — reuse existing class names exactly.
- No changes to `color-scheme: dark` or the `body` background/color rules in `index.css` — other pages must remain visually unaffected.
- Do not touch any other page's CSS file.
- Do not implement the full KPI-dashboard layout (header/KPI cards/scenario grid/quick actions/system status/map/downloads) — out of scope per spec.
- New tokens must be named with a `--light-` prefix: `--light-navy`, `--light-navy-dark`, `--light-bg`, `--light-bg-subtle`, `--light-border`, `--light-ink`, `--light-ink-dim`.

Spec: `docs/superpowers/specs/2026-07-08-homepage-light-theme-design.md`

---

### Task 1: Add shared light-theme tokens to `index.css`

**Files:**
- Modify: `frontend/src/index.css`

**Interfaces:**
- Produces: CSS custom properties available globally via `var(--light-navy)`, `var(--light-navy-dark)`, `var(--light-bg)`, `var(--light-bg-subtle)`, `var(--light-border)`, `var(--light-ink)`, `var(--light-ink-dim)` — consumed by Task 2.

- [ ] **Step 1: Read the current file to confirm line numbers haven't drifted**

Run: `cat -n frontend/src/index.css`
Expected output (current state):
```
     1	:root {
     2	  font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
     3	  color-scheme: dark;
     4	}
     5	
     6	* {
     7	  box-sizing: border-box;
     8	}
     9	
    10	html,
    11	body,
    12	#root {
    13	  margin: 0;
    14	  height: 100%;
    15	}
    16	
    17	body {
    18	  background: #0a0b0f;
    19	  color: #e8eaf0;
    20	}
```
If it differs, stop and re-read this task before editing.

- [ ] **Step 2: Add the light-theme tokens to the `:root` block**

Replace the `:root { ... }` block (lines 1-4) with:

```css
:root {
  font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color-scheme: dark;

  /* Light-theme tokens (used by pages migrating off the dark default,
     e.g. HomePage). The dark rules above remain the app-wide default. */
  --light-navy: #1a4a8a;
  --light-navy-dark: #0A2C58;
  --light-bg: #ffffff;
  --light-bg-subtle: #f8fafc;
  --light-border: #e2e8f0;
  --light-ink: #1e293b;
  --light-ink-dim: #64748b;
}
```

Leave the rest of the file (`*`, `html,body,#root`, `body`) exactly as-is.

- [ ] **Step 3: Verify the file parses and the build still succeeds**

Run: `cd frontend && npm run build`
Expected: build completes with no errors (exit code 0).

- [ ] **Step 4: Commit**

```bash
cd frontend && cd .. && git add frontend/src/index.css
git commit -m "$(cat <<'EOF'
Add shared light-theme CSS tokens

First step of the light-theme migration: define reusable --light-*
tokens on :root without touching the existing dark defaults, so the
homepage (and later pages) can consume a shared palette instead of
hardcoding hex values.
EOF
)"
```

---

### Task 2: Rewrite `HomePage.css` to the flat light theme

**Files:**
- Modify: `frontend/src/pages/HomePage.css` (full rewrite)
- Read-only reference: `frontend/src/pages/HomePage.jsx` (confirms class names — do not modify)

**Interfaces:**
- Consumes: `--light-navy`, `--light-navy-dark`, `--light-bg`, `--light-bg-subtle`, `--light-border`, `--light-ink`, `--light-ink-dim` from Task 1.
- Produces: same class-name contract `HomePage.jsx` already relies on — no new classes required, none removed: `.home-page`, `.home-brand-stage`, `.home-brand-title`, `.page-transition`, `.access-denied-alert`, `.access-denied-alert-content`, `.access-denied-alert-close`.

- [ ] **Step 1: Confirm `HomePage.jsx` class names haven't changed**

Run: `grep -n "className" frontend/src/pages/HomePage.jsx`
Expected output:
```
30:    <div className="home-page page-transition">
32:        <div className="access-denied-alert">
33:          <div className="access-denied-alert-content">
38:              className="access-denied-alert-close"
47:      <main className="home-brand-stage" aria-label="Utility Optimo dashboard">
48:      <h1 className="home-brand-title">UTILITY OPTIMO</h1>
```
(Line numbers may vary slightly; the class list must match exactly.) If any class name differs, stop and reconcile before continuing.

- [ ] **Step 2: Replace the full contents of `HomePage.css`**

Write `frontend/src/pages/HomePage.css` with:

```css
.home-page {
  position: relative;
  height: 100%;
  width: 100%;
}

/* Full-bleed brand stage */
.home-brand-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--light-bg);
}

.home-brand-title {
  position: relative;
  margin: 0;
  padding: 0 24px;
  font-size: clamp(2.5rem, 9vw, 7rem);
  font-weight: 800;
  letter-spacing: 0.18em;
  line-height: 1;
  text-align: center;
  text-transform: uppercase;
  color: var(--light-ink);
  opacity: 0;
  animation: home-title-fade-in 1.8s ease-out forwards;
}

@keyframes home-title-fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Entrance transition for the route */
.page-transition {
  animation: page-fade-in 0.5s ease both;
}

@keyframes page-fade-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Access denied toast */
.access-denied-alert {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 1000;
  max-width: 360px;
  animation: alert-slide-in 0.35s ease both;
}

.access-denied-alert-content {
  position: relative;
  padding: 18px 44px 18px 20px;
  border-radius: 12px;
  border: 1px solid #fecaca;
  background: #fef2f2;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.12);
}

.access-denied-alert-content h3 {
  margin: 0 0 6px;
  font-size: 1rem;
  color: #dc2626;
}

.access-denied-alert-content p {
  margin: 4px 0;
  font-size: 0.85rem;
  line-height: 1.4;
  color: #7f1d1d;
}

.access-denied-alert-close {
  position: absolute;
  top: 8px;
  right: 10px;
  border: none;
  background: transparent;
  color: rgba(127, 29, 29, 0.6);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  transition: color 0.15s ease;
}

.access-denied-alert-close:hover {
  color: #7f1d1d;
}

@keyframes alert-slide-in {
  from {
    opacity: 0;
    transform: translateX(24px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-brand-title,
  .page-transition,
  .access-denied-alert {
    animation: none;
    opacity: 1;
  }
}
```

Note vs. the previous file: the `::before` glow pseudo-element and `brand-pulse` keyframes are removed entirely (flat/minimal treatment, no orb). `.home-brand-title` no longer uses `background-clip: text` / gradient — solid `var(--light-ink)` instead. `.access-denied-alert-content` and its children move from the dark translucent palette to the reference's light palette. `prefers-reduced-motion` now also neutralizes `.home-brand-title`'s animation (added `opacity: 1` fallback so the title isn't stuck invisible when the animation is disabled).

- [ ] **Step 3: Verify the build succeeds**

Run: `cd frontend && npm run build`
Expected: build completes with no errors (exit code 0).

- [ ] **Step 4: Manual visual verification via dev server**

Run: `cd frontend && npm run dev`

Open the app in a browser at the printed local URL and navigate to the homepage (`/`). Confirm:
- White background fills the page, no dark background visible anywhere.
- "UTILITY OPTIMO" renders as solid dark-navy/ink-colored uppercase text, centered, and fades up into place on load (no gradient text, no glow/orb).
- No console errors related to missing CSS variables.
- Other pages (e.g. navigate to Economics or Transmission via the app's normal navigation) are visually unchanged — still dark-themed.

To check the access-denied toast: in the browser devtools console, run
`window.history.pushState({accessDenied: true, deniedPage: 'Test Page'}, '')`
then reload the homepage route, or temporarily navigate via a route that
triggers `location.state.accessDenied` in your app's normal flow. Confirm
the toast renders with a light pink/red background, red border, and dark
red text — legible against the white page — and the `×` close button
dismisses it.

To check reduced motion: in devtools, emulate `prefers-reduced-motion:
reduce` (Chrome DevTools → Rendering tab → Emulate CSS media feature
`prefers-reduced-motion`), reload, and confirm the title appears
immediately (no fade) with no console errors.

Stop the dev server when done (`Ctrl+C`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/HomePage.css
git commit -m "$(cat <<'EOF'
Restyle homepage to flat light theme

Replaces the dark glowing brand-stage with the flat, minimal light
treatment from the reference dashboard design: white background,
solid navy centered wordmark, simple fade-up entrance. No JSX changes
required — same class-name contract. Access-denied toast restyled to
match the new light page.
EOF
)"
```
