import { AppSidebar } from "@/components/AppSidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <div className="sticky top-0 hidden h-screen md:block">
        <AppSidebar />
      </div>
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--line)] bg-white/50 px-4 py-3 backdrop-blur md:hidden">
          <div className="display text-lg">LexOpen</div>
          <a href="/dashboard" className="text-sm text-[var(--sea)]">
            Menú → Dashboard
          </a>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
