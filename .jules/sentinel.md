## 2024-05-16 - [Fix Weak Randomness]
**Vulnerability:** Weak randomness using Math.random() in MinutaWizard.tsx
**Learning:** Math.random() is predictable and unsuitable for IDs. It should be avoided when better alternatives exist.
**Prevention:** Use crypto.randomUUID() for generation of unique identifiers instead.
