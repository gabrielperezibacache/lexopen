/** Reproducible visual inventory. Only runs against a disposable local test database. */
import { chromium } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const databaseUrl = new URL(process.env.E2E_DATABASE_URL || '');
const base = new URL(process.env.UI_REVIEW_URL || 'http://127.0.0.1:3220');
if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol) || !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname) || !/(?:^|[_-])(?:test|e2e)(?:$|[_-])/i.test(decodeURIComponent(databaseUrl.pathname.slice(1))) || databaseUrl.searchParams.has('host') || databaseUrl.searchParams.has('hostaddr') || !['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error('Only local disposable fixtures are allowed');
const selected = process.env.UI_REVIEW_ROUTES?.split(',');
const included = pattern => !selected || selected.includes(pattern);
const output = path.resolve(process.env.UI_REVIEW_OUTPUT || '/private/tmp/lexopen-ui-baseline');
await mkdir(output, { recursive: true });
const db = new PrismaClient({ datasources: { db: { url: databaseUrl.href } } });
const first = async name => db[name].findFirst();
const [cause, client, site, file, minuta, invoice, sheet] = await Promise.all(['causa', 'cliente', 'site', 'siteFile', 'minuta', 'invoice', 'iSheet'].map(first));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: base.href, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const result = [];
let errors = [];
page.on('pageerror', error => errors.push(error.message));
const capture = async (route, pattern = route, theme = 'light') => {
  errors = [];
  const response = await page.goto(route, { waitUntil: 'networkidle', timeout: 90000 });
  await page.evaluate(async theme => { document.documentElement.classList.toggle('dark', theme === 'dark'); await document.fonts.ready; }, theme);
  await page.locator('.book-loading').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  for (const [label, width, height] of [['desktop', 1440, 1000], ['mobile', 360, 900]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const slug = (pattern === '/' ? 'root' : pattern.slice(1)).replaceAll('/', '--').replaceAll(/[\[\]]/g, '');
    const filename = `${slug}-${theme}-${label}.png`;
    await page.screenshot({ path: path.join(output, filename), animations: 'disabled' });
    const metrics = await page.evaluate(() => ({ heading: document.querySelector('h1')?.textContent, overflow: document.documentElement.scrollWidth > innerWidth, width: document.documentElement.scrollWidth, url: location.pathname,
      unnamedFields: [...document.querySelectorAll('input:not([type="hidden"]),select,textarea')].filter(el => el.getClientRects().length && !el.labels?.length && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !['submit','button'].includes(el.type)).map(el => ({ tag: el.tagName, id: el.id, placeholder: el.getAttribute('placeholder') })),
      overflowingElements: [...document.querySelectorAll('main *')].filter(el => { const box = el.getBoundingClientRect(); return box.width && box.right > innerWidth + 1 && getComputedStyle(el).position !== 'absolute' && !el.closest('.overflow-x-auto'); }).slice(0,8).map(el => ({ tag: el.tagName, className: String(el.className).slice(0,120) })),
    }));
    result.push({ route, pattern, theme, viewport: label, status: response?.status(), ...metrics, errors: [...errors], filename });
  }
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify(result, null, 2));
  console.log(`${pattern} ${theme} ${response?.status()}`);
};
try {
  if (included('/login')) await capture('/login');
  const login = await context.request.post('/api/auth/login', { headers: { Origin: base.origin }, data: { email: 'socio@estudio.cl', password: 'lexopen' } });
  if (!login.ok()) throw new Error(`Fixture login failed: ${login.status()}`);
  const imported = await context.request.post('/api/books', { headers: { Origin: base.origin }, multipart: { requestId: 'ae10d618-c30e-4a6a-81b2-5579aa578615', title: 'Cuaderno jurídico · muestra ficticia', author: 'LexOpen · revisión visual', file: { name: 'lectura-ficticia.txt', mimeType: 'text/plain', buffer: Buffer.from('Documento ficticio para revisar la interfaz.\n\nLa lectura jurídica exige distinguir los hechos, las fuentes y la argumentación. Este texto sirve exclusivamente como muestra visual de una biblioteca privada.\n'.repeat(8)) } } });
  const bookResponse = await imported.json();
  if (!imported.ok()) throw new Error(`Book fixture failed: ${JSON.stringify(bookResponse)}`);
  const book = bookResponse.book || bookResponse;
  const doc = await db.documento.findFirst({ where: { causaId: cause.id } });
  let legal;
  if (process.env.UI_REVIEW_PREPARE === '1') {
    const response = await context.request.post('/api/research/sources', { headers: { Origin: base.origin }, data: { mode: 'manual', url: 'https://www.dt.gob.cl/legislacion/1624/w3-article-123456.html', title: 'Fuente ficticia para revisión visual', text: 'Texto aportado manualmente para revisar el lector de fuentes de LexOpen. Esta fuente es una muestra ficticia y no expresa un criterio jurídico oficial. La procedencia, las versiones y los pasajes conservan su identificación al citar.'.repeat(5) } });
    if (!response.ok()) throw new Error(`Legal fixture failed: ${response.status()}`);
    legal = await response.json();
    if (doc) await context.request.post(`/api/documentos/${doc.id}/evidence`, { headers: { Origin: base.origin } });
    await context.request.post(`/api/sites/${site.id}/files/${file.id}/evidence`, { headers: { Origin: base.origin } });
  }
  const roots = await readdir('src/app/(app)', { recursive: true });
  const patterns = roots.filter(file => /(^|\/)page\.tsx$/.test(file)).map(file => '/' + file.replace(/\/page\.tsx$|^page\.tsx$/g, '')).sort();
  for (const pattern of patterns) {
    let route = pattern;
    if (pattern.startsWith('/causas/[id]')) route = route.replace('[id]', cause.id).replace('[minutaId]', minuta.id);
    else if (pattern.startsWith('/clientes/[id]')) route = route.replace('[id]', client.id);
    else if (pattern.startsWith('/sites/[id]')) route = route.replace('[id]', site.id).replace('[fileId]', file.id).replace('[sheetId]', sheet.id);
    else if (pattern.startsWith('/facturacion/facturas/[id]')) route = route.replace('[id]', invoice.id);
    else if (pattern.startsWith('/biblioteca/[id]') && book.id) route = route.replace('[id]', book.id);
    else if (pattern.startsWith('/documentos/[id]') && doc) route = route.replace('[id]', doc.id);
    else if (pattern.startsWith('/jurisprudencia/fuentes/[id]') && legal?.id) route = route.replace('[id]', legal.id);
    if (route.includes('[')) { result.push({ pattern, skipped: 'No matching fixture available' }); continue; }
    if (process.env.UI_REVIEW_ONLY && !pattern.includes(process.env.UI_REVIEW_ONLY)) continue;
    if (!included(pattern)) continue;
    await capture(route, pattern);
  }
  for (const route of ['/inicio', '/causas', '/biblioteca', '/configuracion', '/facturacion', '/jurisprudencia']) if (included(route)) await capture(route, route, 'dark');
  const portal = await context.request.post('/api/auth/login', { headers: { Origin: base.origin }, data: { email: 'cliente@andes.cl', password: 'lexopen' } });
  if (portal.ok() && included('/portal-cliente')) await capture('/portal', '/portal-cliente');
} finally {
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify(result, null, 2));
  await browser.close();
  await db.$disconnect();
}
