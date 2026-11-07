import { runQueuedAltazorTurns } from "@/lib/altazor/worker";
import { runScheduledAcademicCallRefresh } from "@/lib/altazor/academic-calls";
import { processDueDailyBriefs } from "@/lib/altazor/daily-brief";
import { processDueDriveSyncSubscriptions } from "@/lib/integrations/drive-sync";
import { processPendingPjudDocumentJobs } from "@/lib/pjud/document-queue";
import { verifyCronSecret } from "@/lib/security/cron-secret";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!verifyCronSecret(request.headers.get("x-cron-secret"))) {
    return Response.json({ error: "Acceso no autorizado" }, { status: 401 });
  }
  const tasks = [
    ["altazor", () => runQueuedAltazorTurns()],
    ["dailyBrief", () => processDueDailyBriefs()],
    ["academicCalls", () => runScheduledAcademicCallRefresh()],
    ["drive", () => processDueDriveSyncSubscriptions({ limit: 2 })],
    ["pjud", () => processPendingPjudDocumentJobs({ limit: 4 })],
  ] as const;
  const outcomes = await Promise.allSettled(tasks.map(([, run]) => run()));
  const jobs = Object.fromEntries(outcomes.map((result, index) => [tasks[index][0], result.status === "fulfilled"]));
  // Keep provider errors and document/case data out of scheduler responses.
  const ok = outcomes.every(result => result.status === "fulfilled");
  return Response.json({ ok, jobs }, { status: ok ? 200 : 503 });
}
