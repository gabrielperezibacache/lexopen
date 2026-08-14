"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
  const rootRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [demoSwitcher, setDemoSwitcher] = useState(false);
  const [open, setOpen] = useState(false);

  async function load() {
    const res = await fetch("/api/auth/me");
    if (res.status === 401) {
      setUser(null);
      return;
    }
    const data = await res.json();
    setUser(data.user);
    setUsers(data.users || []);
    setDemoSwitcher(Boolean(data.demoSwitcher));
  }

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then(async (res) => {
        if (res.status === 401) return null;
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        if (!data) {
          setUser(null);
          return;
        }
        setUser(data.user);
        setUsers(data.users || []);
        setDemoSwitcher(Boolean(data.demoSwitcher));
      })
      .catch(() => {
        if (active) setUser(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function loginAs(userId: string) {
    if (!demoSwitcher) return;
    await fetch("/api/auth/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setOpen(false);
    await load();
    router.refresh();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (!user) {
    return (
      <Link href="/login" className="nav-link w-full">
        Iniciar sesión
      </Link>
    );
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
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
        <div className="absolute bottom-[calc(100%+0.5rem)] left-0 right-0 z-20 max-h-72 overflow-auto rounded-xl border border-white/10 bg-[#0c1c24] p-2 shadow-xl">
          {demoSwitcher && (
            <>
              <div className="px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white/40">
                Cambiar usuario (solo desarrollo)
              </div>
              {users.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-white/80 hover:bg-white/10"
                  onClick={() => loginAs(u.id)}
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
            </>
          )}
          <Link
            href="/cuenta"
            className="mt-1 flex w-full items-center rounded-lg px-2 py-2 text-left text-sm text-white/80 hover:bg-white/10"
            onClick={() => setOpen(false)}
          >
            Mi cuenta
          </Link>
          <button
            type="button"
            className="mt-1 flex w-full items-center rounded-lg px-2 py-2 text-left text-sm text-white/80 hover:bg-white/10"
            onClick={logout}
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
