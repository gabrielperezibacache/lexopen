import { requireStaffPage } from "@/lib/auth/access";

export default async function MensajesLayout({ children }: { children: React.ReactNode }) {
  await requireStaffPage();
  return children;
}
