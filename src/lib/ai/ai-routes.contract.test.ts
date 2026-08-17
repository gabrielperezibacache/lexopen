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

const agentePage = read("src/app/(app)/agente/page.tsx");
assert.match(agentePage, /AgenteInner/);
assert.doesNotMatch(read("src/components/agente/useAgenteCopilot.ts"), /!res\.ok/);

const jurisPage = read("src/app/(app)/jurisprudencia/page.tsx");
assert.match(jurisPage, /JurisprudenciaBrief/);

const causaPage = read("src/app/(app)/causas/[id]/page.tsx");
assert.match(causaPage, /CausaResumenAi/);
assert.match(causaPage, /PlazoSugerirAi/);

const nuevaCausa = read("src/app/(app)/causas/nueva/page.tsx");
assert.match(nuevaCausa, /CausaExtraerAi/);

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
