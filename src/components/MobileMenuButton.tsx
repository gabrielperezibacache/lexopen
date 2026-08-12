"use client";

export function MobileMenuButton() {
  return (
    <button
      type="button"
      className="text-xs font-medium text-[var(--sea)]"
      onClick={() =>
        (
          document.querySelector(
            "[data-mobile-nav-toggle]"
          ) as HTMLButtonElement | null
        )?.click()
      }
    >
      Menú
    </button>
  );
}
