## 2024-09-10 - Add aria-expanded to collapsible panels
**Learning:** React fragments `<>` cannot hold attributes. When associating a button with `aria-controls`, its target container must be a real HTML node (like `<div>`) with an `id`.
**Action:** When adding accessibility to collapsible regions built with fragments, wrap the conditional block in a semantic or neutral HTML element to attach the `id`.
