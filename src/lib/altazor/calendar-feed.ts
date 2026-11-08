import { createHash, randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { writeAuditStrict } from "@/lib/audit";
import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { canSome } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { mustEnrollTwoFactor } from "@/lib/auth/two-factor-policy";
import { buildIcs } from "@/lib/calendario/ics";
import { prisma } from "@/lib/db";
import { altazorActor, altazorTransaction } from "./access";
import { ACADEMIC_TEACHING_TEMPLATES } from "./academic-templates";
import { calendarSubscriptionBasePath, calendarSubscriptionTokenPattern } from "./calendar-feed-policy";

const unavailable = () => httpError("La suscripción de calendario no está disponible.", 404);
const activeTeaching = { kind: { in: [...ACADEMIC_TEACHING_TEMPLATES] }, archivedAt: null };
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

async function ownedTeachingWorkspace(id: string, user: CausaAccessUser, client: Prisma.TransactionClient) {
  const actor = await altazorActor(user, client);
  const workspace = await client.altazorAcademicWorkspace.findFirst({
    where: { ...activeTeaching, id, ownerId: actor.id },
    select: { id: true, calendarFeedEnabledAt: true },
  });
  if (!workspace) throw unavailable();
  return { actor, workspace };
}

export async function calendarFeedStatus(id: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  const { workspace } = await ownedTeachingWorkspace(id, user, client);
  return { enabled: Boolean(workspace.calendarFeedEnabledAt), enabledAt: workspace.calendarFeedEnabledAt?.toISOString() ?? null };
}

export async function enableCalendarFeed(id: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  return altazorTransaction(client, async tx => {
    const { actor, workspace } = await ownedTeachingWorkspace(id, user, tx);
    await tx.altazorAcademicWorkspace.update({
      where: { id },
      data: { calendarFeedTokenHash: digest(token), calendarFeedEnabledAt: now },
      select: { id: true },
    });
    await writeAuditStrict({
      actorId: actor.id,
      action: workspace.calendarFeedEnabledAt ? "altazor.teaching.feed-rotate" : "altazor.teaching.feed-enable",
      entityType: "AltazorAcademicWorkspace",
      entityId: id,
    }, tx);
    return { enabled: true as const, enabledAt: now.toISOString(), path: `${calendarSubscriptionBasePath}/${token}` };
  });
}

export async function revokeCalendarFeed(id: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  return altazorTransaction(client, async tx => {
    const { actor, workspace } = await ownedTeachingWorkspace(id, user, tx);
    if (workspace.calendarFeedEnabledAt) {
      await tx.altazorAcademicWorkspace.update({
        where: { id },
        data: { calendarFeedTokenHash: null, calendarFeedEnabledAt: null },
        select: { id: true },
      });
      await writeAuditStrict({
        actorId: actor.id, action: "altazor.teaching.feed-revoke", entityType: "AltazorAcademicWorkspace", entityId: id,
      }, tx);
    }
    return { enabled: false as const, enabledAt: null };
  });
}

export async function readCalendarFeed(token: string, client: PrismaClient = prisma) {
  if (!calendarSubscriptionTokenPattern.test(token)) throw unavailable();
  return altazorTransaction(client, async tx => {
    const workspace = await tx.altazorAcademicWorkspace.findFirst({
      where: { ...activeTeaching, calendarFeedTokenHash: digest(token), calendarFeedEnabledAt: { not: null } },
      select: { id: true, owner: { select: { role: true, capabilityGrants: true, capabilityRevokes: true, totpEnabled: true } } },
    });
    if (!workspace) throw unavailable();
    const { owner } = workspace;
    if (!isStaff(owner.role) || !canSome(owner, "assistant.use")) throw unavailable();
    if (mustEnrollTwoFactor({ role: owner.role, totpEnabled: owner.totpEnabled, policyEnabled: true })) {
      const policy = await tx.firmSettings.findFirst({ select: { require2faPrivileged: true } });
      if (policy?.require2faPrivileged !== false) throw unavailable();
    }
    const sessions = await tx.altazorTeachingSession.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, title: true, startsAt: true, endsAt: true, updatedAt: true, calendarSequence: true },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    });
    return buildIcs(sessions.map(session => ({
      id: session.id,
      titulo: session.title,
      inicio: session.startsAt,
      fin: session.endsAt,
      updatedAt: session.updatedAt,
      sequence: session.calendarSequence,
    })), "subscription");
  });
}
