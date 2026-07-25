import { requireStaffPage } from "@/lib/auth/access";

export default async function CausasLayout({ children }: { children: React.ReactNode }) {
  await requireStaffPage();
  return children;
}
