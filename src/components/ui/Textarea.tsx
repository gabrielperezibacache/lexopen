import { cn } from "@/lib/chile";
import type { TextareaHTMLAttributes } from "react";

export function Textarea({
  className,
  invalid,
  error,
  id,
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
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
      <textarea
        id={id}
        className={cn("textarea", className)}
        aria-invalid={invalid || Boolean(error) || undefined}
        aria-describedby={error && id ? `${id}-error` : undefined}
        {...props}
      />
      {error && id ? (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
