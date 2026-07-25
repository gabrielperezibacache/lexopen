import { requireStaffPage } from "@/lib/auth/access";

export default async function FacturacionLayout({ children }: { children: React.ReactNode }) {
  await requireStaffPage();
  return children;
}
