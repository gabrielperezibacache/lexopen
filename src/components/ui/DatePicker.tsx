"use client";

import { Input } from "@/components/ui/Input";
import type { InputHTMLAttributes } from "react";

/**
 * Date control for es-CL practice — native `type="date"` (browser locale)
 * with optional label/error. Avoids heavy calendar libs.
 */
export function DatePicker({
  label,
  error,
  id,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: string;
  error?: string;
}) {
  return (
    <Input
      id={id}
      type="date"
      label={label}
      error={error}
      lang="es-CL"
      {...props}
    />
  );
}
