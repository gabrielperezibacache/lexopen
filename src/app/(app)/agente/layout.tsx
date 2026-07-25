import { requireStaffPage } from "@/lib/auth/access";

export default async function AgenteLayout({ children }: { children: React.ReactNode }) {
  await requireStaffPage();
  return children;
}
