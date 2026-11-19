import type { CaseJobView } from "./types";

export function caseReportText(view: CaseJobView) {
  if (
    !view.available ||
    !view.report ||
    !["awaiting_review", "partial", "completed"].includes(view.status)
  )
    return null;
  return JSON.stringify({
    objective: view.objective,
    report: view.report,
    recordsAtCreation: view.savedSelection?.proposals || [],
    receipts: view.receipts,
    receiptMeaning:
      "Constancia de creación; consulta cada registro para conocer su estado actual.",
    references: view.references,
  });
}
