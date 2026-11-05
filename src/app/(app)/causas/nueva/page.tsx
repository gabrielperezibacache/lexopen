import { Suspense } from "react";
import { NuevaCausaForm } from "@/components/NuevaCausaForm";
import { requireStaffPage } from "@/lib/auth/access";

export default async function NuevaCausaPage() {
  await requireStaffPage();
  return <Suspense fallback={<div className="panel h-40 animate-pulse rounded-[var(--radius-lg)]" />}><NuevaCausaForm /></Suspense>;
}
