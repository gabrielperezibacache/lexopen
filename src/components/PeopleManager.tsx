"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { apiMutation } from "@/lib/api-mutation";

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
  currentUserId,
  compact = false,
}: {
  initialUsers: UserRow[];
  initialGroups: GroupRow[];
  canManage: boolean;
  currentUserId?: string;
  /** Embebido en Configuración: oculta grupos o reduce copy */
  compact?: boolean;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [groups, setGroups] = useState(initialGroups);
  const [userOpen, setUserOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    setOkMsg(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const result = await apiMutation("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create-user",
        name: fd.get("name"),
        email: fd.get("email"),
        role: fd.get("role"),
        title: fd.get("title") || null,
        password: fd.get("password"),
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo crear el usuario");
      return;
    }
    setUserOpen(false);
    setOkMsg("Usuario creado");
    await reload();
  }

  async function saveUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    setOkMsg(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") || "");
    const result = await apiMutation("/api/people", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update-user",
        userId: editing.id,
        name: fd.get("name"),
        email: fd.get("email"),
        role: fd.get("role"),
        title: fd.get("title") || null,
        ...(password ? { password } : {}),
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo actualizar el usuario");
      return;
    }
    setEditing(null);
    setOkMsg("Usuario actualizado");
    await reload();
  }

  async function updateRole(userId: string, role: string) {
    setError(null);
    setOkMsg(null);
    const result = await apiMutation("/api/people", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update-role", userId, role }),
    });
    if (!result.ok) {
      setError(result.error || "No se pudo actualizar el rol");
      await reload();
      return;
    }
    setOkMsg("Rol actualizado");
    await reload();
  }

  async function deleteUser(user: UserRow) {
    if (user.id === currentUserId) {
      setError("No puede eliminar su propio usuario");
      return;
    }
    const ok = window.confirm(
      `¿Eliminar a ${user.name} (${user.email})?\nEsta acción no se puede deshacer.`
    );
    if (!ok) return;
    setError(null);
    setOkMsg(null);
    setBusy(true);
    const result = await apiMutation("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-user", userId: user.id }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo eliminar el usuario");
      return;
    }
    setOkMsg("Usuario eliminado");
    await reload();
  }

  async function createGroup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);
    const fd = new FormData(e.currentTarget);
    const memberIds = fd.getAll("memberIds").map(String).filter(Boolean);
    const result = await apiMutation("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create-group",
        name: fd.get("name"),
        description: fd.get("description") || null,
        memberIds,
      }),
    });
    if (!result.ok) {
      setError(result.error || "No se pudo crear el grupo");
      return;
    }
    setGroupOpen(false);
    setOkMsg("Grupo creado");
    await reload();
  }

  async function saveGroup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingGroup) return;
    setError(null);
    setOkMsg(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const memberIds = fd.getAll("memberIds").map(String).filter(Boolean);
    const result = await apiMutation("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update-group",
        groupId: editingGroup.id,
        name: fd.get("name"),
        description: fd.get("description") || null,
        memberIds,
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo actualizar el grupo");
      return;
    }
    setEditingGroup(null);
    setOkMsg("Grupo actualizado");
    await reload();
  }

  async function deleteGroup(group: GroupRow) {
    const ok = window.confirm(`¿Eliminar el grupo «${group.name}»?`);
    if (!ok) return;
    setError(null);
    setOkMsg(null);
    setBusy(true);
    const result = await apiMutation("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-group", groupId: group.id }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo eliminar el grupo");
      return;
    }
    setOkMsg("Grupo eliminado");
    await reload();
  }

  return (
    <div className="space-y-4" data-testid="people-manager">
      {error && (
        <div
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      )}
      {okMsg && (
        <div
          className="rounded-2xl border border-[var(--ok)]/30 bg-[rgba(31,122,76,0.08)] px-4 py-3 text-sm text-[var(--ink)]"
          role="status"
        >
          {okMsg}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {canManage && (
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setError(null);
              setUserOpen(true);
            }}
          >
            Crear usuario
          </button>
        )}
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => {
            setError(null);
            setGroupOpen(true);
          }}
        >
          Nuevo grupo
        </button>
        {!compact && canManage && (
          <Link href="/configuracion#usuarios" className="btn btn-ghost text-sm">
            Ver en Configuración
          </Link>
        )}
        {compact && (
          <Link href="/personas" className="btn btn-ghost text-sm">
            Abrir Personas
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel rounded-3xl p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Usuarios</h2>
            <span className="text-xs text-[var(--ink-soft)]/60">
              {users.length} en el estudio
            </span>
          </div>
          {users.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="Sin usuarios"
                description="Cree el equipo para asignar roles y acceso a espacios."
              />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="rounded-2xl border border-[var(--line)] px-4 py-3"
                >
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                        style={{ background: u.avatarColor }}
                      >
                        {u.name
                          .split(" ")
                          .slice(0, 2)
                          .map((p) => p[0])
                          .join("")}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium break-words">
                          {u.name}
                          {u.id === currentUserId ? (
                            <span className="ml-2 text-xs text-[var(--sea)]">
                              (usted)
                            </span>
                          ) : null}
                        </div>
                        <div className="break-words text-xs text-[var(--ink-soft)]/65">
                          {u.email} · {u.title || "Sin cargo"}
                        </div>
                      </div>
                    </div>
                    {canManage ? (
                      <select
                        className="select w-full max-w-[140px] sm:w-auto"
                        value={u.role}
                        aria-label={`Rol de ${u.name}`}
                        onChange={(e) => updateRole(u.id, e.target.value)}
                      >
                        {Object.entries(ROLE_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="badge badge-ink">
                        {ROLE_LABEL[u.role] || u.role}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-[var(--ink-soft)]/70">
                    Espacios:{" "}
                    {u.siteMemberships.map((m) => m.site.name).join(", ") || "—"}
                    {" · "}
                    Grupos:{" "}
                    {u.groupMembers.map((m) => m.group.name).join(", ") || "—"}
                  </div>
                  {canManage && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="btn btn-ghost text-xs"
                        type="button"
                        onClick={() => {
                          setError(null);
                          setEditing(u);
                        }}
                      >
                        Editar
                      </button>
                      <button
                        className="btn btn-ghost text-xs text-rose-800"
                        type="button"
                        disabled={busy || u.id === currentUserId}
                        onClick={() => deleteUser(u)}
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel rounded-3xl p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Grupos</h2>
            <span className="text-xs text-[var(--ink-soft)]/60">
              {groups.length} grupos
            </span>
          </div>
          {groups.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="Sin grupos"
                description="Agrupe abogados o equipos para compartir acceso a espacios."
                action={
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => setGroupOpen(true)}
                  >
                    Nuevo grupo
                  </button>
                }
              />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {groups.map((g) => (
                <div
                  key={g.id}
                  className="rounded-2xl border border-[var(--line)] px-4 py-3"
                >
                  <div className="font-medium">{g.name}</div>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]/75">
                    {g.description || "Sin descripción"}
                  </p>
                  <div className="mt-2 text-xs text-[var(--ink-soft)]/65">
                    {g.members.map((m) => m.user.name).join(", ") ||
                      "Sin miembros"}
                  </div>
                  {canManage && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="btn btn-ghost text-xs"
                        type="button"
                        onClick={() => {
                          setError(null);
                          setEditingGroup(g);
                        }}
                      >
                        Editar
                      </button>
                      <button
                        className="btn btn-ghost text-xs text-rose-800"
                        type="button"
                        disabled={busy}
                        onClick={() => deleteGroup(g)}
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {userOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form
            onSubmit={createUser}
            className="panel w-full max-w-md space-y-3 rounded-3xl p-6"
          >
            <h3 className="text-lg font-semibold">Crear usuario</h3>
            <p className="text-xs text-[var(--ink-soft)]/65">
              Roles: admin (configuración), abogado, asistente o cliente (portal).
            </p>
            <input
              className="input"
              name="name"
              required
              placeholder="Nombre completo"
              autoFocus
            />
            <input
              className="input"
              name="email"
              type="email"
              required
              placeholder="Email"
            />
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
              autoComplete="new-password"
            />
            <div className="flex justify-end gap-2">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setUserOpen(false)}
              >
                Cancelar
              </button>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Creando…" : "Crear"}
              </button>
            </div>
          </form>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form
            onSubmit={saveUser}
            className="panel w-full max-w-md space-y-3 rounded-3xl p-6"
          >
            <h3 className="text-lg font-semibold">Editar usuario</h3>
            <input
              className="input"
              name="name"
              required
              defaultValue={editing.name}
            />
            <input
              className="input"
              name="email"
              type="email"
              required
              defaultValue={editing.email}
            />
            <input
              className="input"
              name="title"
              placeholder="Cargo (opcional)"
              defaultValue={editing.title || ""}
            />
            <select className="select" name="role" defaultValue={editing.role}>
              {Object.entries(ROLE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              className="input"
              name="password"
              type="password"
              placeholder="Nueva contraseña (opcional, mín. 12)"
              minLength={12}
              autoComplete="new-password"
            />
            <p className="text-xs text-[var(--ink-soft)]/60">
              Si cambia el rol o la contraseña, se invalidan las sesiones activas
              del usuario.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setEditing(null)}
              >
                Cancelar
              </button>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {groupOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form
            onSubmit={createGroup}
            className="panel w-full max-w-md space-y-3 rounded-3xl p-6"
          >
            <h3 className="text-lg font-semibold">Nuevo grupo</h3>
            <input
              className="input"
              name="name"
              required
              placeholder="Nombre del grupo"
            />
            <textarea
              className="textarea"
              name="description"
              placeholder="Descripción"
            />
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-[var(--ink-soft)]/65">
                Miembros
              </span>
              <select className="select min-h-[120px]" name="memberIds" multiple>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setGroupOpen(false)}
              >
                Cancelar
              </button>
              <button className="btn btn-primary" type="submit">
                Crear
              </button>
            </div>
          </form>
        </div>
      )}

      {editingGroup && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form
            onSubmit={saveGroup}
            className="panel w-full max-w-md space-y-3 rounded-3xl p-6"
          >
            <h3 className="text-lg font-semibold">Editar grupo</h3>
            <input
              className="input"
              name="name"
              required
              defaultValue={editingGroup.name}
            />
            <textarea
              className="textarea"
              name="description"
              placeholder="Descripción"
              defaultValue={editingGroup.description || ""}
            />
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-[var(--ink-soft)]/65">
                Miembros (Ctrl/Cmd para múltiple)
              </span>
              <select
                className="select min-h-[120px]"
                name="memberIds"
                multiple
                defaultValue={editingGroup.members.map((m) => m.user.id)}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setEditingGroup(null)}
              >
                Cancelar
              </button>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
