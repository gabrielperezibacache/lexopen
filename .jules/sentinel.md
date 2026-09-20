## 2024-05-18 - Replace Weak Randomness with crypto.randomUUID()
**Vulnerability:** Weak random number generation using `Math.random().toString(36).slice(2)` for key/ID generation in React component.
**Learning:** `Math.random()` is not cryptographically secure. While the immediate risk for simple list keys is low, it introduces predictable identifiers that can be abused if repurposed.
**Prevention:** Always use `crypto.randomUUID()` for unique identifiers to guarantee cryptographic strength and collision resistance, ensuring defense in depth.
