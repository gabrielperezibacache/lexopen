## 2024-05-18 - Replace Math.random with crypto.randomUUID
**Vulnerability:** Use of `Math.random().toString(36)` to generate keys/IDs in client-side code (`src/components/minutas/MinutaWizard.tsx`).
**Learning:** `Math.random()` provides weak pseudorandomness and is not cryptographically secure. While the impact for React keys may be low, using it to generate unique identifiers can lead to collisions or predictability.
**Prevention:** Always use `crypto.randomUUID()` when generating unique identifiers to ensure robust randomness.
