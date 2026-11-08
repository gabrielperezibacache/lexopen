import Link from "next/link";
import { PeopleManager } from "@/components/PeopleManager";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  title: string | null;
  avatarColor: string;
  capabilityGrants?: string;
  capabilityRevokes?: string;
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
          El administrador del Host gestiona cuentas e integraciones. Socios,
          abogados, procuradores, asistentes y contabilidad trabajan con los
          permisos de su rol; externos y clientes usan el portal. Las excepciones
          personales se revisan al editar cada usuario.
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
