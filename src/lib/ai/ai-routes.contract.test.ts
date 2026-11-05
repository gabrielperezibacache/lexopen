import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const clienteAi = read("src/app/api/clientes/[id]/ai/route.ts");
assert.match(clienteAi, /buildChatHistoryForLlm/);
assert.match(clienteAi, /writeAudit\(/);

const aiActions = read("src/app/api/ai/actions/route.ts");
assert.match(aiActions, /writeAudit\(/);
assert.match(aiActions, /buildActionContext/);

// The compatibility redirect and private archive are exercised end-to-end in
// agente-document-scope.spec.ts; they no longer mount the former Copilot.

const jurisPage = read("src/app/(app)/jurisprudencia/page.tsx");
assert.match(jurisPage, /JurisprudenciaBrief/);

for (const [section, mode] of [["causas", "manual"], ["pjud", "pjud_cl"]] as const) {
  const causaPage = read(`src/app/(app)/${section}/[id]/page.tsx`);
  assert.match(causaPage, /from "@\/components\/causas\/CaseWorkspaceServer"/);
  assert.match(causaPage, new RegExp(`<CaseWorkspaceServer \\{\\.\\.\\.props\\} mode="${mode}"`));
}
const caseWorkspace = read("src/components/causas/CaseWorkspaceServer.tsx");
assert.match(caseWorkspace, /mode: CaseManagementMode/);
assert.match(caseWorkspace, /mode === "pjud_cl" && await getCaseManagementMode\(\) !== "pjud_cl"/);
assert.match(caseWorkspace, /await requireStaff\(\)/);
assert.match(caseWorkspace, /await assertCausaAccess\(id, user\)/);
assert.match(caseWorkspace, /if \(!access\) notFound\(\)/);
assert.ok(caseWorkspace.indexOf("await requireStaff()") < caseWorkspace.indexOf("await assertCausaAccess(id, user)"));
assert.ok(caseWorkspace.indexOf("await assertCausaAccess(id, user)") < caseWorkspace.indexOf("prisma.causa.findFirst("));
assert.match(caseWorkspace, /<CausaResumenAi causaId=\{causa\.id\}/);
assert.match(caseWorkspace, /<PlazoSugerirAi causaId=\{causa\.id\}/);

const nuevaCausa = read("src/app/(app)/causas/nueva/page.tsx");
assert.match(nuevaCausa, /NuevaCausaForm/);
assert.match(read("src/components/NuevaCausaForm.tsx"), /CausaExtraerAi/);

const invoicePage = read("src/app/(app)/facturacion/facturas/[id]/page.tsx");
assert.match(invoicePage, /InvoiceAiPanel/);

const messages = read("src/components/MessagesClient.tsx");
assert.match(messages, /MensajeBorradorAi/);

const wiki = read("src/components/sites/NewWikiButton.tsx");
assert.match(wiki, /WikiBorradorAi/);

const minuta = read("src/components/minutas/MinutaWizard.tsx");
assert.match(minuta, /MinutaBorradorAi/);

const aiAssist = read("src/components/ai/AiAssist.tsx");
assert.match(aiAssist, /useI18n/);

console.log("ai/ai-routes.contract.test.ts OK");
