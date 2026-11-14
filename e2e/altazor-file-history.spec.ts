import { expect, test, type Page, type Route } from "@playwright/test";
import { loginAs } from "./helpers";
import type { FileHistoryPage } from "../src/lib/altazor/computer/file-history-types";
const connector="altazor-google-0123456789abcdef",other="altazor-dropbox-fedcba9876543210";
const history=/\/api\/altazor\/computer\/files\/history(?:\?.*)?$/;
const first:FileHistoryPage={items:[{id:"historical-confirmed",at:"2026-11-01T12:00:00Z",connector,kind:"google-workspace",name:"<script>Documento ficticio</script>.pdf",status:"confirmed",bytes:4200,pages:3}],connectors:[connector,other],nextCursor:"next_fixture_page"};
async function open(page:Page) {
  await page.route(/\/api\/altazor\/computer(?:\?.*)?$/,route=>route.fulfill({json:{computer:{enabled:false,configured:false,policyAllowed:true,canConfigure:false,state:"disabled",workspaceId:null,provider:null,version:null,lastVerifiedAt:null,reason:"Escritorio desactivado",runtime:"container",sessions:[]}}}));
  await page.route(/\/api\/altazor\/computer\/activity(?:\?.*)?$/,route=>route.fulfill({json:{state:"disabled",sessionId:null,monitor:false}}));
  await loginAs(page,"abogado@estudio.cl");await page.goto("/inicio?altazor=computer");
  return page.getByTestId("altazor-computer-panel");
}
test("historial sin escritorio activo: filtros, páginas y móvil sin reejecutar operaciones",async({page},info)=>{
  const calls:URL[]=[],mutations:string[]=[];
  page.on("request",request=>{if(request.url().includes("/api/altazor/computer")&&request.method()!=="GET")mutations.push(request.url());});
  await page.route(history,route=>{
    const url=new URL(route.request().url());calls.push(url);
    return route.fulfill({json:url.searchParams.has("cursor")?{...first,nextCursor:null,items:[{id:"historical-unknown",at:"2026-11-01T10:00:00Z",connector:other,kind:"dropbox",name:"Pendiente.pdf",status:"unknown"}]}:first});
  });
  const panel=await open(page);await expect(panel.getByText("Historial de descargas",{exact:true})).toBeVisible();expect(calls).toHaveLength(0);
  await panel.getByText("Historial de descargas",{exact:true}).click();
  const receipts=panel.getByRole("region",{name:"Recibos históricos de descargas"});
  await expect(receipts.getByText(first.items[0].name,{exact:true})).toBeVisible();await expect(receipts).toContainText("3 páginas");
  expect(await receipts.locator("script").count()).toBe(0);
  await receipts.getByRole("combobox",{name:"Estado",exact:true}).selectOption("confirmed");await receipts.getByRole("combobox",{name:"Conexión",exact:true}).selectOption(connector);
  await receipts.getByLabel("Desde",{exact:true}).fill("2026-11-01");await receipts.getByLabel("Hasta",{exact:true}).fill("2026-11-02");
  await receipts.getByRole("button",{name:"Consultar",exact:true}).click();await expect(receipts.getByRole("button",{name:"Consultar",exact:true})).toBeEnabled();
  expect(calls.at(-1)?.searchParams.get("status")).toBe("confirmed");expect(calls.at(-1)?.searchParams.get("connector")).toBe(connector);expect(calls.at(-1)?.searchParams.get("from")).toBe("2026-11-01");
  await receipts.getByRole("button",{name:"Siguiente",exact:true}).click();await expect(receipts).toContainText("Pendiente.pdf");await expect(receipts).toContainText("Sin confirmar");
  expect(calls.at(-1)?.searchParams.get("cursor")).toBe(first.nextCursor);expect(calls.at(-1)?.searchParams.get("to")).toBe("2026-11-02");
  await receipts.getByRole("button",{name:"Anterior",exact:true}).click();await expect(receipts).toContainText(first.items[0].name);expect(calls.at(-1)?.searchParams.has("cursor")).toBe(false);
  await page.setViewportSize({width:360,height:800});await receipts.scrollIntoViewIfNeeded();expect(await receipts.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  await receipts.screenshot({path:info.outputPath("download-history-mobile.png")});expect(mutations).toEqual([]);
});
test("la revocación elimina los recibos anteriores y una respuesta tardía no reabre el historial",async({page})=>{
  let denied=false,pending:Route|null=null,hold=false;
  await page.route(history,async route=>{if(hold){pending=route;return;}await route.fulfill({status:denied?403:200,json:denied?{error:"No access"}:first});});
  const panel=await open(page),summary=panel.getByText("Historial de descargas",{exact:true});await summary.click();
  const receipts=panel.getByRole("region",{name:"Recibos históricos de descargas"});await expect(receipts).toContainText(first.items[0].name);
  denied=true;await receipts.getByRole("button",{name:"Consultar",exact:true}).click();await expect(receipts.getByRole("alert")).toBeVisible();await expect(receipts.getByText(first.items[0].name,{exact:true})).toHaveCount(0);
  denied=false;hold=true;await receipts.getByRole("button",{name:"Consultar",exact:true}).click();await expect.poll(()=>Boolean(pending)).toBe(true);
  await summary.click();await expect(receipts).toHaveCount(0);await (pending as unknown as Route).fulfill({json:first}).catch(()=>{});await expect(receipts).toHaveCount(0);
  hold=false;await summary.click();await expect(receipts).toContainText(first.items[0].name);
});
