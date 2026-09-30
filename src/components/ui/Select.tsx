import { cn } from "@/lib/chile";
import type { SelectHTMLAttributes } from "react";

export function Select({
  className,
  invalid,
  error,
  id,
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
  error?: string;
  label?: string;
}) {
  return (
    <div className="w-full">
      {label && id ? (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[var(--ink)]">
          {label}
        </label>
      ) : null}
      <select
        id={id}
        className={cn("select", className)}
        aria-invalid={invalid || Boolean(error) || undefined}
        aria-describedby={error && id ? `${id}-error` : undefined}
        {...props}
      >
        {children}
      </select>
      {error && id ? (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
