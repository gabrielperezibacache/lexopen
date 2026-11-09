export type SearchableCommand = { label: string; keywords?: string; group?: string };
const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** Search only the already authorized catalog. Stable ordering breaks equal-score ties. */
export function searchCommands<T extends SearchableCommand>(items: readonly T[], query: string): T[] {
  const q = normalized(query.slice(0, 200)), terms = [...new Set(q.split(/\s+/).filter(Boolean))];
  if (!terms.length) return [...items];
  return items.map((item, index) => {
    const label = normalized(item.label), words = label.split(" "), all = normalized(`${item.label} ${item.group || ""} ${item.keywords || ""}`);
    if (!terms.every(term => all.includes(term))) return null;
    const score = (label === q ? 1000 : label.startsWith(q) ? 200 : 0) + terms.reduce((sum, term) => sum + (label.includes(term) ? 50 : 10) + (words.some(word => word.startsWith(term)) ? 20 : 0), 0);
    return { item, index, score };
  }).filter((entry): entry is { item: T; index: number; score: number } => entry !== null).sort((a, b) => b.score - a.score || a.index - b.index).map(entry => entry.item);
}
