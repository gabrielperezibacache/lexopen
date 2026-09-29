## 2024-10-24 - Add ARIA Attributes to Disclosure Widgets
**Learning:** Collapsible panels and toggle buttons in the application frequently miss `aria-expanded` and `aria-controls` attributes, rendering them difficult to use for screen reader users as they receive no feedback about the widget's current state.
**Action:** When implementing disclosure widgets or collapsible panels, always include `aria-expanded` on the toggle button and `aria-controls` linked to the `id` of the content container to ensure proper screen reader support.
