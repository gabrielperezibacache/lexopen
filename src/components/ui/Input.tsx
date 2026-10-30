import { cn } from "@/lib/chile";
import type { InputHTMLAttributes } from "react";

export function Input({
  className,
  invalid,
  hint,
  error,
  id,
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  hint?: string;
  error?: string;
  label?: string;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="w-full">
      {label && id ? (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[var(--ink)]">
          {label}
        </label>
      ) : null}
      <input
        id={id}
        className={cn("input", className)}
        aria-invalid={invalid || Boolean(error) || undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
