
## 2024-10-01 - Accessible Custom Modals
**Learning:** Custom modal dialogs using fixed overlay divs (`className="fixed inset-0"`) in this codebase often lack accessibility attributes, making them opaque to screen readers.
**Action:** When implementing or editing custom modals, always include `role="dialog"`, `aria-modal="true"`, and an `aria-labelledby` attribute linked to the modal's heading element's `id`.
