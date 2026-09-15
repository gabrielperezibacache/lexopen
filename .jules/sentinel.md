## 2025-02-18 - Weak Randomness in React Keys
**Vulnerability:** Weak randomness using `Math.random().toString(36).slice(2)` for generating React keys for action drafts in `MinutaWizard.tsx`.
**Learning:** `Math.random` is an insecure pseudo-random number generator (PRNG) and its values can be predictable. While this specific instance is just for React keys, using strong cryptography for all randomness is a good defense-in-depth practice and avoids security scanners flagging insecure functions.
**Prevention:** Use `crypto.randomUUID()` when a unique string identifier is needed, or the `crypto` API for generating random bytes, rather than `Math.random()`.
