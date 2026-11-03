// Helpers to find a business's own website without paid search: guess its domain and verify the page names it.
const SUFFIX = /\b(inc|llc|co|corp|company|ltd)\b\.?/gi;
export function guessDomains(name: string): string[] {
  const base = name.toLowerCase().replace(SUFFIX, "").replace(/&/g, "and").replace(/[^a-z0-9 ]/g, "").trim();
  if (!base) return [];
  const joined = base.replace(/\s+/g, "");
  const words = base.split(/\s+/);
  const out = [joined + ".com", joined + "mn.com", words.join("-") + ".com"];
  return [...new Set(out)].filter(d => d.length > 6 && d.length < 64).slice(0, 3);
}
export function nameMatches(name: string, html: string): boolean {
  const words = name.toLowerCase().replace(SUFFIX, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 3);
  if (!words.length) return false;
  const h = html.toLowerCase();
  if (/domain (is )?for sale|buy this domain|parked|godaddy\.com\/domainsearch|hugedomains/.test(h)) return false;
  return words.filter(w => h.includes(w)).length >= Math.min(2, words.length);
}
