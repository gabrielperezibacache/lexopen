import { handleRouteError, requireStaff } from "@/lib/api";
import { downloadResponseHeaders } from "@/lib/security/download";
import { exportPendingTasks } from "@/lib/tasks/export";
import { TASK_XLSX_MIME } from "@/lib/tasks/export-xlsx";
import { readTaskWorkspaceFilters } from "@/lib/tasks/workspace";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireStaff();
    const filters = readTaskWorkspaceFilters(new URL(request.url).searchParams);
    const workbook = await exportPendingTasks(actor, filters);
    return new Response(Uint8Array.from(workbook), { headers: {
      ...downloadResponseHeaders("lexopen-tareas-pendientes.xlsx", TASK_XLSX_MIME),
      "Content-Length": String(workbook.length),
      Vary: "Cookie",
    } });
  } catch (error) {
    const response = handleRouteError(error);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Cookie");
    return response;
  }
}
