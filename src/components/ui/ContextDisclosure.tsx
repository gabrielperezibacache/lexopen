"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
/** Keep draft forms mounted; public fragment links reveal their destination. */
export function ContextDisclosure({
  id,
  title,
  children,
  defaultOpen = false,
  className = "",
  summaryClassName = "min-h-11 cursor-pointer py-3 font-medium",
}: {
  id: string;
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  summaryClassName?: string;
}) {
  const root = useRef<HTMLDetailsElement>(null),
    [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    let frame = 0;
    const reveal = () => {
      let hash = "";
      try {
        hash = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      if (!hash) return;
      const target = document.getElementById(hash);
      if (
        target &&
        (root.current === target || root.current?.contains(target))
      ) {
        setOpen(true);
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() =>
          target.scrollIntoView({ block: "start" }),
        );
      }
    };
    // Clicking the same fragment again does not emit hashchange.
    const reopen = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        anchor instanceof HTMLAnchorElement &&
        anchor.href === window.location.href &&
        anchor.hash &&
        (!anchor.target || anchor.target === "_self")
      )
        reveal();
    };
    reveal();
    document.addEventListener("click", reopen);
    window.addEventListener("hashchange", reveal);
    window.addEventListener("popstate", reveal);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("click", reopen);
      window.removeEventListener("hashchange", reveal);
      window.removeEventListener("popstate", reveal);
    };
  }, []);
  return (
    <details
      ref={root}
      id={id}
      open={open}
      // A fragment can make the browser expand this element before hydration.
      // The reveal effect reconciles that native open state with React.
      suppressHydrationWarning
      className={`scroll-mt-24 ${className}`}
      onToggle={(event) => {
        if (event.target === event.currentTarget)
          setOpen(event.currentTarget.open);
      }}
    >
      <summary className={summaryClassName}>{title}</summary>
      {children}
    </details>
  );
}
