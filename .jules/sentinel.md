## 2024-05-24 - Fix weak randomness in UI components
**Vulnerability:** Weak randomness using `Math.random().toString(36).slice(2)` for key generation in UI components.
**Learning:** `Math.random()` is not cryptographically secure and can generate predictable values. Even for React component keys, predictability can sometimes lead to issues in highly dynamic arrays or, when accidentally reused for broader ID generation, security flaws.
**Prevention:** Always use `crypto.randomUUID()` when a unique identifier is needed on modern runtimes (both Node and browsers support it).
