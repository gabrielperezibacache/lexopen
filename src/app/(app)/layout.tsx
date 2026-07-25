import { AppSidebar } from "@/components/AppSidebar";
import { getCurrentUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-screen">
      <div className="sticky top-0 h-screen">
        <AppSidebar role={user?.role} />
      </div>
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--line)] bg-white/50 px-4 py-3 backdrop-blur md:hidden">
          <div className="display text-lg">LexOpen</div>
          <span className="text-xs text-[var(--ink-soft)]/65">Menú flotante ↓</span>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
