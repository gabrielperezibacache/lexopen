import Link from "next/link";
import { PeopleManager } from "@/components/PeopleManager";

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

export function UsersAdminPanel({
  users,
  groups,
  currentUserId,
}: {
  users: UserRow[];
  groups: GroupRow[];
  currentUserId: string;
}) {
  return (
    <section
      id="usuarios"
      className="space-y-4"
      data-testid="users-admin-panel"
    >
      <div className="panel rounded-3xl p-5 md:p-6">
        <h2 className="text-lg font-semibold">Usuarios del estudio</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
          Crear, editar y eliminar usuarios y grupos del estudio. Los clientes
          usan el portal; admin, abogado y asistente acceden a LexOpen interno.
          También disponible en{" "}
          <Link href="/personas" className="text-[var(--sea)]">
            Personas
          </Link>
          .
        </p>
      </div>
      <PeopleManager
        canManage
        compact
        currentUserId={currentUserId}
        initialUsers={users}
        initialGroups={groups}
      />
    </section>
  );
}
