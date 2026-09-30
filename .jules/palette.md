# LexOpen agent palette (canonical: `.jules/`)

Copper `#c47a3a` · sea `#1f6f78` · ink `#0c1c24` · Fraunces + Sora.
Tokens live in `src/app/globals.css` (`:root` / `html.dark` + Tailwind `@theme`).

## Learnings

## 2024-10-24 - Add ARIA Attributes to Disclosure Widgets
**Learning:** Collapsible panels and toggle buttons in the application frequently miss `aria-expanded` and `aria-controls` attributes, rendering them difficult to use for screen reader users as they receive no feedback about the widget's current state.
**Action:** When implementing disclosure widgets or collapsible panels, always include `aria-expanded` on the toggle button and `aria-controls` linked to the `id` of the content container to ensure proper screen reader support.

## 2024-03-24 - Loading states on TOTP buttons
**Learning:** Adding loading text states to async operation buttons in the TOTP settings panel gives immediate visual feedback. Users know when an operation is processing without having to look at disabled states or network requests.
**Action:** When adding async operations to forms, ensure buttons display a loading text (e.g., "Configurando…") instead of just getting disabled when `busy` is true.

## 2025-02-12 - Loading states on async operations
**Learning:** Adding loading text states to async operation buttons provides immediate visual feedback. Users know when an operation is processing without having to look at disabled states or network requests.
**Action:** When adding async operations to forms, ensure buttons display a loading text (e.g., "Restaurando…") instead of just getting disabled when `busy` is true.

## 2026-09-30 - Theme + reduced motion
**Learning:** Dark mode must respect `prefers-color-scheme` and persist via `lexopen_theme`; animations must honor `prefers-reduced-motion`.
**Action:** Use `ThemeProvider` + boot script in root layout; keep micro-interactions at 150–200ms via CSS tokens `--motion-*`.
