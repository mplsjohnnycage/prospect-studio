// v3 items 8, 10, 13, 16, 18, 20, 24, 25: pure logic for Build, Sense extras, runtime leases and pay-to-production.
import type {Fact} from "./revenue-engine";

// ---------- Item 8: DemoIR + deterministic renderer (every text node traces to a Fact) ----------
export type Segment = "home_services" | "legal_dental_medspa" | "real_estate" | "restaurant_salon_auto";
export type IRText = { text: string; factIdx?: number }; // factIdx undefined = template copy (no claims)
export type DemoIR = { business: string; city: string; segment: Segment; hero: IRText; services: IRText[]; proof: IRText[]; images: { src: string; alt: string; factIdx: number }[]; system: SystemSpec; ctaLabel: string };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export function segmentFor(trade: string): Segment {
  if (/law|attorney|dent|med ?spa|chiro|clinic|orthodont/i.test(trade)) return "legal_dental_medspa";
  if (/real estate|realtor|builder|new build/i.test(trade)) return "real_estate";
  if (/restaurant|cafe|salon|barber|auto|nail/i.test(trade)) return "restaurant_salon_auto";
  return "home_services";
}
export function buildIR(p: { name: string; city: string; trade: string; facts: Fact[]; images?: { src: string; alt: string; factIdx: number }[] }): DemoIR {
  const seg = segmentFor(p.trade);
  const fx = p.facts.map((f, i) => ({ text: f.text, factIdx: i }));
  return { business: p.name, city: p.city, segment: seg, hero: fx[0] ?? { text: p.trade + " in " + p.city },
    services: fx.slice(1, 4), proof: fx.slice(4, 7), images: (p.images ?? []).filter(i => i.factIdx < p.facts.length), system: systemFor(seg), ctaLabel: systemFor(seg).cta };
}
/** Images first: a demo without at least one sourced image is held unless allowNoImages. */
export function irIssues(ir: DemoIR, facts: Fact[], allowNoImages = false): string[] {
  const out: string[] = [];
  for (const t of [ir.hero, ...ir.services, ...ir.proof]) if (t.factIdx !== undefined && !facts[t.factIdx]?.sourceUrl) out.push("Unsourced text: " + t.text.slice(0, 40));
  if (!ir.images.length && !allowNoImages) out.push("No sourced images (images-first)");
  return out;
}
export function renderIR(ir: DemoIR, facts: Fact[], actionUrl = "#"): string {
  const cite = (t: IRText) => esc(t.text) + (t.factIdx !== undefined ? ` <a class="src" href="${esc(facts[t.factIdx].sourceUrl)}" rel="nofollow noopener" target="_blank">source</a>` : "");
  const form = `<form data-system="${ir.system.kind}" method="post" action="${esc(actionUrl)}">${ir.system.fields.map(f => `<label>${esc(f.label)}<input name="${f.name}" type="${f.type}"${f.required ? " required" : ""}></label>`).join("")}<button type="submit">${esc(ir.ctaLabel)}</button></form>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(ir.business)} (DEMO)</title></head><body>` +
    `<div data-demo-banner role="note">DEMO · A private website concept for ${esc(ir.business)}. Not the official site.</div>` +
    ir.images.map(i => `<img src="${esc(i.src)}" alt="${esc(i.alt)}">`).join("") +
    `<header><h1>${esc(ir.business)}</h1><p>${cite(ir.hero)}</p><a href="#book">${esc(ir.ctaLabel)}</a></header>` +
    (ir.services.length ? `<section><h2>Services</h2><ul>${ir.services.map(s => `<li>${cite(s)}</li>`).join("")}</ul></section>` : "") +
    (ir.proof.length ? `<section><h2>What customers say</h2>${ir.proof.map(s => `<blockquote>${cite(s)}</blockquote>`).join("")}</section>` : "") +
    `<section id="book"><h2>${esc(ir.system.title)}</h2>${form}</section></body></html>`;
}

// ---------- Item 10: working system per segment ----------
export type SystemSpec = { kind: "quote" | "booking" | "intake" | "showing"; title: string; cta: string; fields: { name: string; label: string; type: string; required?: boolean }[] };
export function systemFor(seg: Segment): SystemSpec {
  const contact = [{ name: "name", label: "Name", type: "text", required: true }, { name: "phone", label: "Phone", type: "tel", required: true }, { name: "email", label: "Email", type: "email" }];
  switch (seg) {
    case "home_services": return { kind: "quote", title: "Request a quote", cta: "Get my quote", fields: [...contact, { name: "address", label: "Job address", type: "text", required: true }, { name: "details", label: "What do you need done?", type: "text" }, { name: "photos", label: "Photos", type: "file" }] };
    case "legal_dental_medspa": return { kind: "intake", title: "New client intake", cta: "Book a consultation", fields: [...contact, { name: "reason", label: "Reason for visit", type: "text", required: true }, { name: "preferred", label: "Preferred time", type: "datetime-local" }] };
    case "real_estate": return { kind: "showing", title: "Schedule a showing", cta: "Request a showing", fields: [...contact, { name: "preferred", label: "Preferred time", type: "datetime-local", required: true }] };
    default: return { kind: "booking", title: "Book now", cta: "Book a time", fields: [...contact, { name: "preferred", label: "Preferred time", type: "datetime-local", required: true }, { name: "party", label: "Party size / service", type: "text" }] };
  }
}
export function validateSubmission(spec: SystemSpec, body: Record<string, string>): string[] {
  return spec.fields.filter(f => f.required && !(body[f.name] ?? "").trim()).map(f => f.label + " is required");
}

// ---------- Item 13: NPI Registry (free, no key) -> raw record fields ----------
export type NpiResult = { number: number; basic?: { organization_name?: string; first_name?: string; last_name?: string; enumeration_date?: string }; addresses?: { address_purpose: string; city: string; state: string; telephone_number?: string; address_1?: string }[]; taxonomies?: { desc: string; primary?: boolean }[] };
export const npiSearchUrl = (city: string, taxonomy: string, limit = 20) => `https://npiregistry.cms.hhs.gov/api/?version=2.1&enumeration_type=NPI-2&state=MN&city=${encodeURIComponent(city)}&taxonomy_description=${encodeURIComponent(taxonomy)}&limit=${Math.min(200, limit)}`;
export function npiToFields(r: NpiResult) {
  const loc = r.addresses?.find(a => a.address_purpose === "LOCATION") ?? r.addresses?.[0];
  const name = r.basic?.organization_name ?? [r.basic?.first_name, r.basic?.last_name].filter(Boolean).join(" ");
  return { id: "npi:" + r.number, name, city: loc?.city ?? "", phone: loc?.telephone_number, address: loc?.address_1, trade: r.taxonomies?.find(t => t.primary)?.desc ?? r.taxonomies?.[0]?.desc, sourceUrl: "https://npiregistry.cms.hhs.gov/provider-view/" + r.number, enumerationDate: r.basic?.enumeration_date };
}

// ---------- Item 16: Brand DNA from reviews + photos (links only) ----------
const STOP = new Set("the and a to of was were they for in is it with very on we our my this that had have be are at as so but you your their them he she from an or not all would will just".split(" "));
export function brandDna(reviews: { text: string; url: string }[], photos: { url: string; caption?: string }[] = []) {
  const counts = new Map<string, number>();
  for (const r of reviews) for (const w of r.text.toLowerCase().match(/[a-z']{4,}/g) ?? []) if (!STOP.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  const themes = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);
  const quotes = reviews.filter(r => r.text.length >= 40 && r.text.length <= 240).slice(0, 3).map(r => ({ text: r.text, sourceUrl: r.url }));
  const tone = /friendly|kind|family|honest/i.test(reviews.map(r => r.text).join(" ")) ? "warm" : /fast|quick|efficient|on time/i.test(reviews.map(r => r.text).join(" ")) ? "efficient" : "professional";
  return { themes, quotes, tone, photoLinks: photos.slice(0, 8).map(p => ({ url: p.url, caption: p.caption ?? "" })) };
}

// ---------- Item 17: owner/contact selection (survivors only, public business contacts only) ----------
export function bestContact(c: { emails?: string[]; phones?: string[]; formUrl?: string }): { channel: "email" | "phone" | "form" | "none"; value: string } {
  const biz = (c.emails ?? []).find(e => !/@(gmail|yahoo|hotmail|outlook|aol)\./i.test(e)) ?? c.emails?.[0];
  if (biz) return { channel: "email", value: biz };
  if (c.formUrl) return { channel: "form", value: c.formUrl };
  if (c.phones?.[0]) return { channel: "phone", value: c.phones[0] };
  return { channel: "none", value: "" };
}

// ---------- Item 18: grid sweep + segment price bands ----------
export function gridTiles(bbox: [number, number, number, number], stepDeg = 0.05): [number, number, number, number][] {
  const [s, w, n, e] = bbox; const out: [number, number, number, number][] = [];
  for (let la = s; la < n; la += stepDeg) for (let lo = w; lo < e; lo += stepDeg) out.push([+la.toFixed(5), +lo.toFixed(5), +Math.min(n, la + stepDeg).toFixed(5), +Math.min(e, lo + stepDeg).toFixed(5)]);
  return out;
}
export const TWIN_CITIES_BBOX: [number, number, number, number] = [44.85, -93.35, 45.05, -92.95];
// [A] bands are seller asking prices, not Twin Cities market data.
export const PRICE_BANDS: Record<Segment, { low: number; high: number; avgTicket: number }> = {
  home_services: { low: 1500, high: 4000, avgTicket: 8000 }, legal_dental_medspa: { low: 3000, high: 8000, avgTicket: 2500 },
  real_estate: { low: 300, high: 1500, avgTicket: 9000 }, restaurant_salon_auto: { low: 500, high: 1500, avgTicket: 60 },
};
/** Fit gate from the band: $2,000 should be rounding error vs a typical ticket. */
export function fitFromBand(seg: Segment, price = 2000): number { const t = PRICE_BANDS[seg].avgTicket; return Math.max(10, Math.min(100, Math.round(100 * Math.min(1, t / (price * 2))))); }

// ---------- Item 20: task leases (built-in worker always drains; external claims expire) ----------
export type Task = { id: string; status: "queued" | "claimed" | "done" | "failed"; claimedBy?: string; leaseUntil?: number; attempts: number };
export function claimable(t: Task, now: number): boolean { return t.status === "queued" || (t.status === "claimed" && (t.leaseUntil ?? 0) < now); }
export function claim(t: Task, who: string, now: number, leaseMs = who === "builtin" ? 10 * 60_000 : 5 * 60_000): Task | null {
  if (!claimable(t, now) || t.attempts >= 5) return null;
  return { ...t, status: "claimed", claimedBy: who, leaseUntil: now + leaseMs, attempts: t.attempts + 1 };
}
export function nextForBuiltin(tasks: Task[], now: number): Task | undefined { return tasks.filter(t => claimable(t, now) && t.attempts < 5).sort((a, b) => a.attempts - b.attempts || a.id.localeCompare(b.id))[0]; }

// ---------- Item 24: pay-to-production timestamps ----------
export const PROD_STEPS = ["paid", "repo_created", "domain_connected", "backend_live", "site_live"] as const;
export type ProdStep = typeof PROD_STEPS[number];
export function advance(stamps: Partial<Record<ProdStep, number>>, step: ProdStep, at: number): Partial<Record<ProdStep, number>> {
  const i = PROD_STEPS.indexOf(step);
  for (const prev of PROD_STEPS.slice(0, i)) if (stamps[prev] === undefined) throw Error("Step " + step + " before " + prev);
  if (stamps[step] !== undefined) return stamps;
  return { ...stamps, [step]: at };
}
export function hoursToLive(s: Partial<Record<ProdStep, number>>): number | undefined { return s.paid !== undefined && s.site_live !== undefined ? (s.site_live - s.paid) / 3_600_000 : undefined; }

// ---------- Item 25: proposal link, off by default ----------
export function proposalLine(url: string | undefined, enabled: boolean): string { return enabled && url ? "\n\nIf you want to see options and pricing: " + url : ""; }
