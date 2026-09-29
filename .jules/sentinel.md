## 2025-02-18 - [Insecure Randomness Replacement]
**Vulnerability:** Found `Math.random()` being used to generate unique key strings.
**Learning:** `Math.random()` generates weak, predictable values, which poses a security risk when these values are assumed to be unguessable.
**Prevention:** Consistently use cryptographic methods, like `crypto.randomUUID()`, when secure uniqueness is necessary.
