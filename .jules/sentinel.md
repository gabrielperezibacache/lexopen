
## 2026-09-19 - Weak Randomness in Client Identifier
**Vulnerability:** Weak randomness using Math.random() found in client-side key generation.
**Learning:** Math.random() is predictable and should be avoided for generating identifiers.
**Prevention:** Use crypto.randomUUID() for secure, collision-resistant unique identifiers.
