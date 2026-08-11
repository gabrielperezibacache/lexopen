"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  title: string | null;
  avatarColor: string;
  siteMemberships: Array<{ site: { id: string; name: string } }>;
  groupMembers: Array<{ group: { id: string; name: string } }>;
};

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  members: Array<{ user: { id: string; name: string } }>;
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  abogado: "Abogado",
  asistente: "Asistente",
  cliente: "Cliente",
};

export function PeopleManager({
  initialUsers,
  initialGroups,
  canManage,
}: {
  initialUsers: UserRow[];
  initialGroups: GroupRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [groups, setGroups] = useState(initialGroups);
  const [userOpen, setUserOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/people");
    if (!res.ok) return;
    const data = await res.json();
    setUsers(data.users);
    setGroups(data.groups);
    router.refresh();
  }

  async function createUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create-user",
        name: fd.get("name"),
        email: fd.get("email"),
        role: fd.get("role"),
        title: fd.get("title") || null,
        password: fd.get("password") || undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se pudo crear el usuario");
      return;
    }
    setUserOpen(false);
    await reload();
  }

  async function updateRole(userId: string, role: string) {
    setError(null);
    const res = await fetch("/api/people", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update-role", userId, role }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se pudo actualizar el rol");
      return;
    }
    await reload();
  }

  async function createGroup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const memberIds = fd.getAll("memberIds").map(String).filter(Boolean);
    const res = await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create-group",
        name: fd.get("name"),
        description: fd.get("description") || null,
        memberIds,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se pudo crear el grupo");
      return;
    }
    setGroupOpen(false);
    await reload();
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {canManage && (
          <button className="btn btn-primary" type="button" onClick={() => setUserOpen(true)}>
            Invitar usuario
          </button>
        )}
        <button className="btn btn-secondary" type="button" onClick={() => setGroupOpen(true)}>
          Nuevo grupo
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel rounded-3xl p-5">
          <h2 className="text-lg font-semibold">Usuarios</h2>
          {users.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="Sin usuarios"
                description="Invite al equipo para asignar roles y acceso a espacios."
              />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {users.map((u) => (
                <div key={u.id} className="rounded-2xl border border-[var(--line)] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="grid h-10 w-10 place-items-center rounded-full text-xs font-bold text-white"
                        style={{ background: u.avatarColor }}
                      >
                        {u.name
                          .split(" ")
                          .slice(0, 2)
                          .map((p) => p[0])
                          .join("")}
                      </span>
                      <div>
                        <div className="font-medium">{u.name}</div>
                        <div className="text-xs text-[var(--ink-soft)]/65">
                          {u.email} · {u.title || "Sin cargo"}
                        </div>
                      </div>
                    </div>
                    {canManage ? (
                      <select
                        className="select max-w-[140px]"
                        value={u.role}
                        onChange={(e) => updateRole(u.id, e.target.value)}
                      >
                        {Object.entries(ROLE_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="badge badge-ink">{ROLE_LABEL[u.role] || u.role}</span>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-[var(--ink-soft)]/70">
                    Espacios:{" "}
                    {u.siteMemberships.map((m) => m.site.name).join(", ") || "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel rounded-3xl p-5">
          <h2 className="text-lg font-semibold">Grupos</h2>
          {groups.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="Sin grupos"
                description="Agrupe abogados o equipos para compartir acceso a espacios."
                action={
                  <button className="btn btn-primary" type="button" onClick={() => setGroupOpen(true)}>
                    Nuevo grupo
                  </button>
                }
              />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {groups.map((g) => (
                <div key={g.id} className="rounded-2xl border border-[var(--line)] px-4 py-3">
                  <div className="font-medium">{g.name}</div>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]/75">
                    {g.description || "Sin descripción"}
                  </p>
                  <div className="mt-2 text-xs text-[var(--ink-soft)]/65">
                    {g.members.map((m) => m.user.name).join(", ") || "Sin miembros"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {userOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form onSubmit={createUser} className="panel w-full max-w-md space-y-3 rounded-3xl p-6">
            <h3 className="text-lg font-semibold">Invitar usuario</h3>
            <input className="input" name="name" required placeholder="Nombre completo" />
            <input className="input" name="email" type="email" required placeholder="Email" />
            <input className="input" name="title" placeholder="Cargo (opcional)" />
            <select className="select" name="role" defaultValue="abogado">
              <option value="abogado">Abogado</option>
              <option value="asistente">Asistente</option>
              <option value="admin">Admin</option>
              <option value="cliente">Cliente</option>
            </select>
            <input
              className="input"
              name="password"
              type="password"
              placeholder="Contraseña (mínimo 12 caracteres)"
              minLength={12}
              required
            />
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" type="button" onClick={() => setUserOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" type="submit">
                Crear
              </button>
            </div>
          </form>
        </div>
      )}

      {groupOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form onSubmit={createGroup} className="panel w-full max-w-md space-y-3 rounded-3xl p-6">
            <h3 className="text-lg font-semibold">Nuevo grupo</h3>
            <input className="input" name="name" required placeholder="Nombre del grupo" />
            <textarea className="textarea" name="description" placeholder="Descripción" />
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-[var(--ink-soft)]/65">Miembros</span>
              <select className="select min-h-[120px]" name="memberIds" multiple>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" type="button" onClick={() => setGroupOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" type="submit">
                Crear
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
