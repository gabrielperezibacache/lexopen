## 2024-03-24 - Loading states on TOTP buttons
**Learning:** Adding loading text states to async operation buttons in the TOTP settings panel gives immediate visual feedback. Users know when an operation is processing without having to look at disabled states or network requests.
**Action:** When adding async operations to forms, ensure buttons display a loading text (e.g., "Configurando…") instead of just getting disabled when `busy` is true.
## 2025-02-12 - Loading states on async operations
**Learning:** Adding loading text states to async operation buttons provides immediate visual feedback. Users know when an operation is processing without having to look at disabled states or network requests.
**Action:** When adding async operations to forms, ensure buttons display a loading text (e.g., "Restaurando…") instead of just getting disabled when `busy` is true.
## 2026-10-01 - Adding loading text to async buttons
**Learning:** When async operations are triggered on buttons that only disable themselves, the user might not realize the operation is ongoing.
**Action:** Add conditional text rendering (e.g., `{busy ? 'Procesando…' : 'Procesar'}`) in addition to the `disabled` state for better visual feedback.
