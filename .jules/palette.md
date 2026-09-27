## 2024-05-18 - Improve accessibility of settings collapse button
**Learning:** Found a collapse panel pattern that lacked aria attributes tying the button to the expanded content. It's a common accessibility issue to have collapsible elements lacking appropriate aria state indication (aria-expanded and aria-controls).
**Action:** When implementing disclosure widgets or collapsible panels in this codebase, always include aria-expanded on the toggle button and aria-controls linked to the id of the content container to ensure screen reader accessibility.
