/** Conservative freshness checks for manual validation; never used by production sync. */
import type { Page } from "playwright";
import { parseMisCausasFromHtml } from "@/lib/pjud/parse-html";
import type { MisCausasItem } from "@/lib/pjud/types";

export async function snapshotManualMisCausasRows(page: Page) {
  await page.evaluate(() => {
    const state = window as typeof window & { lexopenManualMisCausas?: Set<Element> };
    // Snapshot hidden rows too: merely revealing an old row is not a fresh result.
    const rows = [...document.querySelectorAll("tr, .card, .list-group-item")]
      .filter((row) => !row.querySelector("tr, .card, .list-group-item"));
    state.lexopenManualMisCausas = new Set(rows);
  });
}

async function newManualMisCausasRows(page: Page) {
  return page.evaluate(() => {
    const state = window as typeof window & { lexopenManualMisCausas?: Set<Element> };
    return [...document.querySelectorAll("tr, .card, .list-group-item")]
      .filter((row) => {
        if (row.querySelector("tr, .card, .list-group-item") || !row.getClientRects().length || state.lexopenManualMisCausas?.has(row)) return false;
        for (let parent: Element | null = row; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0 || parent.hasAttribute("hidden")) return false;
          if (parent.classList.contains("tab-pane") && !parent.classList.contains("active")) return false;
        }
        return true;
      })
      .map((row) => row.outerHTML);
  });
}

function explicitEmptyRows(html: string) {
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  return /no se (?:han encontrado|encontraron) (?:causas|resultados|registros)|no hay (?:causas|resultados|registros)|sin (?:causas|resultados|registros)|ning[uú]n dato disponible/i.test(text);
}

function freshItems(rows: string[]) {
  const items: MisCausasItem[] = [];
  let empty = false;
  for (const row of rows) {
    const current = parseMisCausasFromHtml(row);
    items.push(...current);
    if (!current.length && explicitEmptyRows(row)) empty = true;
  }
  return { items, observed: items.length > 0 || empty };
}

/** Only new/replaced data rows qualify. Changes within an old row are inconclusive. */
export async function waitForFreshManualMisCausasRows(page: Page, timeoutMs = 20_000): Promise<MisCausasItem[]> {
  const deadline = Date.now() + timeoutMs;
  do {
    const response = freshItems(await newManualMisCausasRows(page));
    if (response.observed) {
      await snapshotManualMisCausasRows(page);
      return response.items;
    }
    await page.waitForTimeout(100);
  } while (Date.now() < deadline);
  throw new Error("Mis Causas no mostró filas nuevas verificables. No se usarán resultados anteriores.");
}

export async function clearManualMisCausasRows(page: Page) {
  await page.evaluate(() => {
    delete (window as typeof window & { lexopenManualMisCausas?: Set<Element> }).lexopenManualMisCausas;
  }).catch(() => undefined);
}
