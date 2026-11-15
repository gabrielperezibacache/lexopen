import { expect,test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma } from "../src/lib/db";
import { generateTotpCode,generateTotpSecret,sealTotpSecret } from "../src/lib/auth/totp";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { apiRequest,authenticateApiRequests,loginAs } from "./helpers";
assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
test("recordar navegador, salir y volver, revocar confianza y exigir de nuevo 2FA",async({page})=>{
 test.setTimeout(90_000);const tag=randomUUID(),secret=generateTotpSecret();let id="";
 async function passwordLogin(email:string){await page.goto("/login");await page.locator('input[name="email"]').fill(email);await page.locator('input[name="password"]').fill("lexopen");await page.locator('button[type="submit"]').click();}
 try{
  const user=await prisma.user.create({data:{email:`${tag}@trusted-browser.invalid`,name:"Equipo ficticio",role:"abogado",password:await hash("lexopen",10),totpEnabled:true,totpSecretEnc:sealTotpSecret(secret)}});id=user.id;
  await passwordLogin(user.email);await expect(page.getByText("Recordar este navegador durante 30 días",{exact:true})).toBeVisible();
  await page.locator('input[name="totp"]').fill(generateTotpCode(secret));await page.locator('input[name="rememberDevice"]').check();await page.locator('button[type="submit"]').click();await page.waitForURL(/\/inicio/);
  const cookie=(await page.context().cookies()).find(row=>row.name==="lexopen_trusted_device");expect(cookie?.httpOnly).toBe(true);expect(cookie?.value.length).toBe(43);
  await authenticateApiRequests(page);expect((await apiRequest(page).post("/api/auth/logout")).ok()).toBe(true);
  await loginAs(page,user.email); // The remembered device survives normal logout.
  await page.goto("/cuenta");const panel=page.getByRole("region",{name:"Equipos recordados",exact:true});await expect(panel.getByText(/Este navegador/)).toBeVisible();
  const data=await (await page.request.get("/api/auth/devices")).json();expect(JSON.stringify(data)).not.toContain(cookie!.value);expect(JSON.stringify(data)).not.toContain("tokenHash");
  await panel.getByRole("button",{name:/Revocar confianza/}).click();await expect(panel.getByText("No tiene equipos recordados activos.",{exact:true})).toBeVisible();
  await authenticateApiRequests(page);expect((await apiRequest(page).post("/api/auth/logout")).ok()).toBe(true);
  await passwordLogin(user.email);await expect(page.locator('input[name="totp"]')).toBeVisible();await expect(page.locator('input[name="rememberDevice"]')).not.toBeChecked();
  await page.locator('input[name="totp"]').fill(generateTotpCode(secret));await page.locator('button[type="submit"]').click();await page.waitForURL(/\/inicio/);
 }finally{if(id){await prisma.auditEvent.deleteMany({where:{actorId:id}});await prisma.user.delete({where:{id}});}await prisma.$disconnect();}
});
