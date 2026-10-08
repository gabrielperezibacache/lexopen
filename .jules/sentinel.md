## 2026-10-08 - [Hide Next.js Powered-By Header]
**Vulnerability:** Information Disclosure
**Learning:** Default Next.js configuration exposes the technology stack via the X-Powered-By header, which can aid attackers in reconnaissance.
**Prevention:** Always set poweredByHeader: false in next.config.ts to minimize exposed infrastructure details.
