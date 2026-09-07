## 2024-03-24 - Loading states on TOTP buttons
**Learning:** Adding loading text states to async operation buttons in the TOTP settings panel gives immediate visual feedback. Users know when an operation is processing without having to look at disabled states or network requests.
**Action:** When adding async operations to forms, ensure buttons display a loading text (e.g., "Configurando…") instead of just getting disabled when `busy` is true.
