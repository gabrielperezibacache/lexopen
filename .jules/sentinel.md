## 2025-02-14 - Replace Math.random with crypto.randomUUID
**Vulnerability:** Weak random number generation using `Math.random().toString(36)` to generate unique keys for React elements and component state (`AccionDraft`).
**Learning:** `Math.random` is not cryptographically secure and can lead to predictable patterns or collisions, which is a bad practice even for UI keys.
**Prevention:** Use `crypto.randomUUID()` to generate standard, collision-resistant UUIDs for all unique identifier requirements.
