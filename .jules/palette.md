## 2024-05-24 - Accessibility for Disclosure Widgets
**Learning:** Collapsible panels (like SiteSettingsPanel and SitesGuidePanel) were missing ARIA attributes to indicate their state to screen readers.
**Action:** When creating or updating collapsible sections, always pair the toggle button with `aria-expanded` and link it to the content container using `aria-controls`. Ensure the content container has an `id`.
