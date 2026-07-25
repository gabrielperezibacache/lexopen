import { requireStaffPage } from "@/lib/auth/access";

export default async function BuscarLayout({ children }: { children: React.ReactNode }) {
  await requireStaffPage();
  return children;
}
