import { requireStaffPage } from "@/lib/auth/access";

export default async function IntegracionesLayout({ children }: { children: React.ReactNode }) {
  await requireStaffPage();
  return children;
}
