## 2024-05-24 - Replace weak PRNG with secure random UUID
**Vulnerability:** Found `Math.random().toString(36).slice(2)` used to generate keys in `src/components/minutas/MinutaWizard.tsx`.
**Learning:** `Math.random()` is not cryptographically secure, and shouldn't be used for generating keys, ids, or tokens, especially in a security context.
**Prevention:** Use `crypto.randomUUID()` instead, which uses a secure random number generator and is globally unique.
