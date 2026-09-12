## 2024-05-18 - [Replaced Insecure PRNG]
**Vulnerability:** Weak PRNG (`Math.random()`) used for key generation.
**Learning:** `Math.random()` was used instead of robust crypto mechanisms for generating random keys.
**Prevention:** Always use `crypto.randomUUID()` when running in browser or Node contexts where unique unpredictable identifiers are needed.
