## 2026-09-14 - Replaced weak Math.random key generation
**Vulnerability:** Use of predictable `Math.random()` for generating component keys in MinutaWizard.tsx.
**Learning:** Even for non-persisted UI component keys, using predictable random generation is a bad practice that could lead to potential collisions or security risks.
**Prevention:** Use cryptographically secure `crypto.randomUUID()` whenever unique identifiers are needed.
