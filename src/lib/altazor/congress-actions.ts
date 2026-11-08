import type { PrismaClient } from "@prisma/client";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { canSome } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { ACADEMIC_WORKSPACE_LIMIT, academicCongressSchema } from "./academic-schemas";
import { teachingTime } from "./teaching-sessions";

/** Personal planning dates are visible only in the internal Agenda. */
export async function congressCalendarActions(
  user: CausaAccessUser,
  range: { start: Date; end: Date },
  client: PrismaClient = prisma,
) {
  if (!isStaff(user.role) || !canSome(user, "assistant.use")) return [];
  const actor = await client.user.findUnique({
    where: { id: user.id },
    select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true },
  });
  if (!actor || !isStaff(actor.role) || !canSome(actor, "assistant.use")) return [];
  const workspaces = await client.altazorAcademicWorkspace.findMany({
    where: { ownerId: actor.id, kind: "congress", archivedAt: null },
    select: { id: true, briefJson: true },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: ACADEMIC_WORKSPACE_LIMIT,
  });
  const events: { id: string; title: string; startsAt: Date; workspaceId: string }[] = [];
  for (const workspace of workspaces) {
    let organization;
    try { organization = academicCongressSchema.safeParse(JSON.parse(workspace.briefJson).congress); }
    catch { continue; }
    if (!organization.success) continue;
    for (const action of organization.data.actions ?? []) {
      if (!action.dueAtLocal || action.status === "done") continue;
      let startsAt: Date;
      try { startsAt = teachingTime(action.dueAtLocal); }
      catch { continue; }
      if (startsAt < range.start || startsAt > range.end) continue;
      events.push({
        id: `congress-action:${workspace.id}:${action.id}`,
        title: action.title,
        startsAt,
        workspaceId: workspace.id,
      });
    }
  }
  return events.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime() || left.id.localeCompare(right.id)).slice(0, 300);
}
