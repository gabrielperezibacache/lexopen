## 2024-10-24 - Add ARIA Attributes to Disclosure Widgets
**Learning:** Collapsible panels and toggle buttons in the application frequently miss `aria-expanded` and `aria-controls` attributes, rendering them difficult to use for screen reader users as they receive no feedback about the widget's current state.
**Action:** When implementing disclosure widgets or collapsible panels, always include `aria-expanded` on the toggle button and `aria-controls` linked to the `id` of the content container to ensure proper screen reader support.
## 2023-10-01 - Add ARIA attributes to modal dialogs
**Learning:** Found multiple instances of custom modal dialogs built with `fixed inset-0` overlays lacking appropriate ARIA roles. This causes screen readers to treat the modal simply as part of the document flow, instead of trapping focus mentally as a modal.
**Action:** When implementing custom modal dialogs, always include `role="dialog"`, `aria-modal="true"`, and an `aria-labelledby` attribute linked to the modal's heading `id` to ensure proper screen reader accessibility.
