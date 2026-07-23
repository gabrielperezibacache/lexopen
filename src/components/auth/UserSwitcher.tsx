"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  title?: string | null;
  avatarColor?: string;
};

export function UserSwitcher() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);

  async function load() {
    const res = await fetch("/api/auth/me");
    const data = await res.json();
    setUser(data.user);
    setUsers(data.users || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function loginAs(email: string) {
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "lexopen" }),
    });
    setOpen(false);
    await load();
    router.refresh();
  }

  if (!user) {
    return (
      <button className="nav-link w-full" type="button" onClick={() => loginAs("socio@estudio.cl")}>
        Iniciar sesión demo
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="grid h-8 w-8 place-items-center rounded-full text-xs font-bold text-white"
          style={{ background: user.avatarColor || "#1f6f78" }}
        >
          {user.name
            .split(" ")
            .slice(0, 2)
            .map((p) => p[0])
            .join("")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-white">{user.name}</span>
          <span className="block truncate text-[11px] text-white/50">{user.role}</span>
        </span>
      </button>
      {open && (
        <div className="absolute bottom-[calc(100%+0.5rem)] left-0 right-0 z-20 max-h-64 overflow-auto rounded-xl border border-white/10 bg-[#0c1c24] p-2 shadow-xl">
          <div className="px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white/40">
            Cambiar usuario (demo)
          </div>
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-white/80 hover:bg-white/10"
              onClick={() => loginAs(u.email)}
            >
              <span
                className="h-6 w-6 rounded-full"
                style={{ background: u.avatarColor || "#1f6f78" }}
              />
              <span className="min-w-0">
                <span className="block truncate">{u.name}</span>
                <span className="block truncate text-[11px] text-white/45">{u.email}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
