import { can, effectiveCapabilities, CAPABILITY_LABELS, parseCapabilityCsv, type PermissionSubject } from "@/lib/auth/permissions";
import { roleLabel } from "@/lib/auth/roles";
import { isAdmin, isStaff } from "@/lib/auth/rbac";

export function MyPermissions({ user, locale }: { user: PermissionSubject; locale: "es" | "en" }) {
  const tr = (es: string, en: string) => locale === "en" ? en : es;
  const grants = parseCapabilityCsv(user.capabilityGrants);
  const revokes = parseCapabilityCsv(user.capabilityRevokes);
  const staff = isStaff(user.role);
  const levels = {
    all: tr("Disponible", "Available"),
    scoped: tr("Según causa o recurso propio", "By matter or owned resource"),
    none: tr("No habilitado", "Not enabled"),
  };

  return <section id="permisos" className="panel space-y-4 rounded-3xl p-5 md:p-6" aria-labelledby="my-permissions-title" data-testid="my-permissions">
    <div>
      <h2 id="my-permissions-title" className="text-lg font-semibold">{tr("Mi rol y permisos", "My role and permissions")}</h2>
      <p className="mt-1 text-sm text-[var(--ink-soft)]">{tr("Rol asignado", "Assigned role")}: <strong>{roleLabel(user.role)}</strong>.</p>
    </div>
    <p className="max-w-prose text-sm text-[var(--ink-soft)]">
      {isAdmin(user)
        ? tr("Puedes administrar la configuración compartida y los usuarios del estudio. Este permiso no sustituye los permisos jurídicos ni el acceso a cada causa.", "You can manage shared firm settings and users. This permission does not replace legal permissions or access to each matter.")
        : tr("Tus preferencias y conexiones personales se aplican a tu cuenta. La administración del estudio controla los ajustes compartidos y los permisos de cada usuario.", "Personal preferences and connections apply to your account. Firm administrators manage shared settings and each user's permissions.")}
    </p>
    <p className="max-w-prose text-sm text-[var(--muted)]">{tr("Los permisos adicionales amplían el rol; una revocación siempre prevalece. Los permisos limitados requieren acceso a la causa o al recurso, y la pertenencia de solo lectura no autoriza cambios.", "Additional permissions extend the role; a revocation always takes precedence. Limited permissions require access to the matter or resource, and read-only membership does not authorize changes.")}</p>
    {staff && <details>
      <summary className="cursor-pointer text-sm font-semibold text-[var(--sea)]">{tr("Ver mis permisos efectivos", "View my effective permissions")}</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm [overflow-wrap:normal]">
          <thead><tr className="border-b border-[var(--line)]">
            <th scope="col" className="whitespace-nowrap p-2">{tr("Permiso", "Permission")}</th>
            <th scope="col" className="whitespace-nowrap p-2">{tr("Alcance", "Scope")}</th>
            <th scope="col" className="whitespace-nowrap p-2">{tr("Origen", "Source")}</th>
          </tr></thead>
          <tbody>{effectiveCapabilities(user).map(({ cap, level }) => <tr key={cap} data-capability={cap} className="border-b border-[var(--line)]">
            <th scope="row" className="p-2 font-normal">{locale === "en" ? cap : CAPABILITY_LABELS[cap]}</th>
            <td className="p-2">{levels[level]}</td>
            <td className="p-2">{revokes.includes(cap) ? tr("Revocado", "Revoked") : grants.includes(cap) && can(user, cap) ? tr("Permiso adicional", "Additional permission") : tr("Rol", "Role")}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>}
  </section>;
}
