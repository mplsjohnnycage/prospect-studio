// v3 revenue engine: pure, offline-testable logic for Sense -> Qualify -> Build -> Reach -> Learn.
// No network I/O and no sending happens here. Convex/worker code calls these functions.

// ---------- Shared types ----------
export type TriggerType = "new_filing" | "permit" | "sba_loan" | "new_domain" | "review_spike" | "ad_launch" | "dead_site" | "new_listing" | "site_complaint" | "none";
export type Trigger = { type: TriggerType; date?: string; source?: string; detail?: string };
export const NO_TRIGGER: Trigger = { type: "none" };
export const DAY = 86_400_000;
export const ON_TRIGGER_DAYS = 14; // [A] "on trigger" = draft within 14 days of the event

export function triggerAgeDays(t: Trigger, now = Date.now()): number | undefined {
  if (t.type === "none" || !t.date) return undefined;
  const ms = Date.parse(t.date);
  if (!Number.isFinite(ms)) return undefined;
  return Math.max(0, Math.floor((now - ms) / DAY));
}

// ---------- Item 7: identity key (website optional) ----------
export function normalizePhone(phone?: string): string {
  const d = (phone ?? "").replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length === 10 ? ten : "";
}
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export function identityKey(r: { placeId?: string; osmId?: string; phone?: string; city?: string; name?: string; website?: string }): string {
  if (r.placeId) return "place:" + r.placeId;
  const phone = normalizePhone(r.phone);
  if (phone && r.city) return "phone:" + phone + ":" + slug(r.city.split(",")[0]);
  if (r.osmId) return "osm:" + r.osmId;
  if (r.website) { try { return "site:" + new URL(r.website).hostname.toLowerCase().replace(/^www\./, ""); } catch { /* fall through */ } }
  return "name:" + slug(r.name ?? "") + ":" + slug((r.city ?? "").split(",")[0]);
}

// ---------- Item 4: raw records from free sources ----------
export type RawRecord = {
  id: string; identityKey: string; source: "osm" | "mn_sos" | "mpls_open_data" | "stp_open_data" | "maps_desktop" | "sba" | "permit" | "manual";
  sourceUrl: string; fetchedAt: number; name: string; city: string; trade?: string; phone?: string; website?: string;
  address?: string; lat?: number; lon?: number; hours?: string; trigger?: Trigger; raw?: Record<string, unknown>;
};
export type OsmElement = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };
export function osmToRecord(e: OsmElement, fallbackCity: string, fetchedAt = Date.now()): RawRecord | null {
  const t = e.tags ?? {};
  const name = (t.name ?? "").trim();
  if (!name) return null;
  const city = (t["addr:city"] ?? fallbackCity).trim();
  const phone = t.phone ?? t["contact:phone"];
  const website = t.website ?? t["contact:website"] ?? t.url;
  const osmId = e.type + "/" + e.id;
  const addr = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  return {
    id: "osm:" + osmId, identityKey: identityKey({ osmId, phone, city, name, website }), source: "osm",
    sourceUrl: "https://www.openstreetmap.org/" + osmId, fetchedAt, name, city, phone, website,
    trade: t.craft ?? t.shop ?? t.office ?? t.amenity ?? t.healthcare, address: addr || undefined,
    lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon, hours: t.opening_hours,
  };
}
/** Overpass QL for named businesses in an area, optionally only those without a website. */
export function overpassQuery(area: string, key: "craft" | "shop" | "office" | "healthcare", noWebsite = false, limit = 50): string {
  const safeArea = area.replace(/["\\]/g, "");
  const nw = noWebsite ? "[!website][!\"contact:website\"]" : "";
  return `[out:json][timeout:25];area["name"="${safeArea}"]["boundary"="administrative"]->.a;nwr["${key}"]["name"]${nw}(area.a);out center ${Math.max(1, Math.min(200, limit))};`;
}
/** Socrata/CKAN style open-data row (city licenses, permits) -> raw record with trigger. */
export function openDataToRecord(row: Record<string, unknown>, opts: { source: RawRecord["source"]; datasetUrl: string; city: string; nameField: string; dateField?: string; trigger?: TriggerType; idField?: string; phoneField?: string; addressField?: string }, fetchedAt = Date.now()): RawRecord | null {
  const str = (k?: string) => (k && row[k] != null ? String(row[k]).trim() : undefined);
  const name = str(opts.nameField);
  if (!name) return null;
  const rid = str(opts.idField) ?? slug(name + "-" + (str(opts.addressField) ?? ""));
  const date = str(opts.dateField);
  const phone = str(opts.phoneField);
  return {
    id: opts.source + ":" + rid, identityKey: identityKey({ phone, city: opts.city, name }), source: opts.source,
    sourceUrl: opts.datasetUrl, fetchedAt, name, city: opts.city, phone, address: str(opts.addressField),
    trigger: opts.trigger && date ? { type: opts.trigger, date: date.slice(0, 10), source: opts.datasetUrl } : undefined, raw: row,
  };
}
/** Merge records sharing an identity key; first source wins fields, later fills gaps. */
export function dedupeRecords(rs: RawRecord[]): RawRecord[] {
  const m = new Map<string, RawRecord>();
  for (const r of rs) {
    const prev = m.get(r.identityKey);
    if (!prev) { m.set(r.identityKey, { ...r }); continue; }
    for (const k of ["phone", "website", "address", "trade", "hours", "lat", "lon"] as const) if (prev[k] == null && r[k] != null) (prev as Record<string, unknown>)[k] = r[k];
    if (r.trigger && (!prev.trigger || (r.trigger.date ?? "") > (prev.trigger.date ?? ""))) prev.trigger = r.trigger;
  }
  return [...m.values()];
}

// ---------- Item 5: site health (free checks) ----------
export type SiteProbe = { url?: string; status?: number; https?: boolean; html?: string; loadMs?: number; pageSpeed?: number; dnsFailed?: boolean; unknown?: boolean };
export type SiteHealth = { state: "none" | "dead" | "weak" | "ok"; score: number; issues: string[] };
export function siteHealth(p: SiteProbe, year = new Date().getFullYear()): SiteHealth {
  if (p.unknown) return { state: "weak", score: 50, issues: ["Website not checked yet"] };
  if (!p.url) return { state: "none", score: 100, issues: ["No website listed"] };
  if (/business\.site/i.test(p.url)) return { state: "dead", score: 95, issues: ["Links to a Google business.site page, which Google shut down"] };
  if (p.dnsFailed || (p.status !== undefined && (p.status >= 400 || p.status === 0))) return { state: "dead", score: 90, issues: [p.dnsFailed ? "Domain does not resolve" : "Site returns HTTP " + p.status] };
  const issues: string[] = []; let s = 0;
  const add = (n: number, why: string) => { s += n; issues.push(why); };
  const html = (p.html ?? "").toLowerCase();
  if (p.https === false || p.url.startsWith("http:")) add(20, "No SSL");
  if (p.pageSpeed !== undefined && p.pageSpeed < 50) add(20, "PageSpeed " + p.pageSpeed);
  else if (p.loadMs !== undefined && p.loadMs > 4000) add(15, "Loads in " + (p.loadMs / 1000).toFixed(1) + "s");
  const yrs = [...html.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/g)].map(m => Number(m[1]));
  if (yrs.length && year - Math.max(...yrs) >= 3) add(15, "Copyright " + Math.max(...yrs));
  if (/wix\.com|godaddy|weebly|site123|jimdo|homestead/.test(html)) add(10, "Old site-builder template");
  if (html && !/gtag\(|googletagmanager|google-analytics|plausible|fbq\(/.test(html)) add(10, "No analytics");
  if (html && !/<meta[^>]+viewport/.test(html)) add(15, "Not mobile friendly");
  return { state: s >= 30 ? "weak" : "ok", score: Math.min(100, s), issues };
}

// ---------- Item 14: care / review signals ----------
export type Reviews = { count?: number; rating?: number; lastReviewAt?: number; responseRate?: number; countPrevMonth?: number; countThisMonth?: number };
export function careScore(r: Reviews, now = Date.now()): { score: number; reasons: string[]; spike?: Trigger } {
  const reasons: string[] = []; let s = 0;
  if (r.lastReviewAt && now - r.lastReviewAt <= 60 * DAY) { s += 35; reasons.push("Review in the last 60 days"); }
  if ((r.responseRate ?? 0) > 0.8) { s += 35; reasons.push("Replies to over 80% of reviews"); }
  const prev = r.countPrevMonth ?? 0, cur = r.countThisMonth ?? 0;
  if (cur > prev) { s += 15; reasons.push("Review count growing month over month"); }
  if ((r.count ?? 0) >= 20) { s += 15; reasons.push(r.count + " reviews"); }
  const spike = cur >= 5 && cur >= 2 * Math.max(1, prev) ? { type: "review_spike" as const, date: new Date(now).toISOString().slice(0, 10), detail: cur + " reviews this month vs " + prev } : undefined;
  return { score: Math.min(100, s), reasons, spike };
}

// ---------- Item 5: five gates ----------
export type GateInput = { trade: string; site: SiteHealth; reviews?: Reviews; adsActive?: boolean; paidListing?: boolean; triggers?: Trigger[]; now?: number };
export type Gates = { fit: number; gap: number; spend: number; care: number; timing: number };
export type GateResult = { gates: Gates; passed: boolean; tier: "top" | "strong" | "standard" | "hold"; total: number; trigger: Trigger; reasons: string[] };
const HIGH_TICKET = /law|attorney|dental|dentist|med ?spa|orthodont|roof|hvac|plumb|remodel|solar|landscap|concrete|electric|chiropract|real estate|builder|pool|fenc|siding|window|paint/i;
const LOW_TICKET = /food truck|nail|barber|tutor|dog walk|babysit/i;
export const GATE_FLOOR: Gates = { fit: 50, gap: 30, spend: 0, care: 0, timing: 0 };
export function pickTrigger(ts: Trigger[] = [], now = Date.now()): Trigger {
  const dated = ts.filter(t => t.type !== "none").map(t => ({ t, age: triggerAgeDays(t, now) ?? 9999 })).sort((a, b) => a.age - b.age);
  return dated[0]?.t ?? NO_TRIGGER;
}
export function fiveGates(i: GateInput): GateResult {
  const now = i.now ?? Date.now();
  const reasons: string[] = [];
  const fit = HIGH_TICKET.test(i.trade) ? 90 : LOW_TICKET.test(i.trade) ? 20 : 60;
  const gap = i.site.score;
  const spend = (i.adsActive ? 70 : 0) + (i.paidListing ? 30 : 0);
  const care = i.reviews ? careScore(i.reviews, now) : { score: 0, reasons: [] as string[], spike: undefined };
  const trigger = pickTrigger([...(i.triggers ?? []), ...(care.spike ? [care.spike] : []), ...(i.site.state === "dead" ? [{ type: "dead_site" as const, date: new Date(now).toISOString().slice(0, 10) }] : [])], now);
  const age = triggerAgeDays(trigger, now);
  const timing = age === undefined ? 0 : age <= ON_TRIGGER_DAYS ? 100 : age <= 60 ? 50 : 10;
  const gates = { fit, gap, spend: Math.min(100, spend), care: care.score, timing };
  reasons.push(...i.site.issues.map(x => "Gap: " + x), ...care.reasons.map(x => "Care: " + x));
  if (i.adsActive) reasons.push("Spend: running ads");
  if (trigger.type !== "none") reasons.push("Timing: " + trigger.type + (trigger.date ? " on " + trigger.date : ""));
  const passed = (Object.keys(GATE_FLOOR) as (keyof Gates)[]).every(k => gates[k] >= GATE_FLOOR[k]);
  const tier = !passed ? "hold" : gates.spend >= 50 && gates.care >= 50 && gates.gap >= 30 ? "top" : gates.timing >= 50 || gates.spend >= 50 ? "strong" : "standard";
  const total = Math.round(0.2 * fit + 0.25 * gap + 0.2 * gates.spend + 0.15 * gates.care + 0.2 * timing);
  return { gates, passed, tier, total, trigger, reasons };
}

// ---------- Item 2: capacity-based demo budget ----------
export type BudgetCandidate = { id: string; score: number; qualified: boolean; paused: boolean; tier?: GateResult["tier"]; trigger?: Trigger; alreadyBuilt?: boolean };
const TIER_RANK = { top: 0, strong: 1, standard: 2, hold: 3 } as const;
export function selectDemoBudget<T extends BudgetCandidate>(items: T[], opts: { dailyCapacity: number; usedToday?: number; scoreFloor?: number; now?: number }): T[] {
  const now = opts.now ?? Date.now();
  const left = Math.max(0, Math.floor(opts.dailyCapacity) - Math.max(0, opts.usedToday ?? 0));
  const floor = opts.scoreFloor ?? 50;
  const fresh = (t?: Trigger) => { const a = t ? triggerAgeDays(t, now) : undefined; return a !== undefined && a <= ON_TRIGGER_DAYS ? a : Infinity; };
  return items.filter(p => p.qualified && !p.paused && p.score >= floor && p.tier !== "hold")
    .sort((a, b) => fresh(a.trigger) - fresh(b.trigger) || TIER_RANK[a.tier ?? "standard"] - TIER_RANK[b.tier ?? "standard"] || b.score - a.score || a.id.localeCompare(b.id))
    .reduce<T[]>((out, p) => { if (p.alreadyBuilt || out.filter(x => !x.alreadyBuilt).length < left) out.push(p); return out; }, []);
}

// ---------- Item 3: "why now" first email ----------
export const SENDER = "johnnyc@agentmail.to";
export const POSTAL_ADDRESS = "13 5th Ave, Oakdale, MN 55128";
export type Fact = { text: string; sourceUrl: string };
export type WhyNowInput = { name: string; trade: string; city: string; trigger: Trigger; gap: string[]; facts: Fact[]; demoUrl?: string; optOutUrl?: string; postalAddress?: string; now?: number };
const TRIGGER_LINE: Record<TriggerType, (n: string, d: string) => string> = {
  new_filing: (n, d) => `I saw ${n} filed with the Minnesota Secretary of State${d}. Congrats on the launch.`,
  permit: (n, d) => `I noticed a new permit for ${n}${d}, so it looks like you're growing.`,
  sba_loan: (n, d) => `I saw ${n} recently secured SBA financing${d}.`,
  new_domain: (n, d) => `I noticed ${n} registered a new domain${d}, but there's no site on it yet.`,
  review_spike: (n, d) => `${n} has picked up a wave of new reviews${d}.`,
  ad_launch: (n, d) => `I saw ${n} started running ads${d}.`,
  dead_site: (n) => `I tried to visit ${n}'s website and it isn't loading right now.`,
  new_listing: (n, d) => `I saw the new listing for ${n}${d}.`,
  site_complaint: (n, d) => `I noticed a customer mention trouble with ${n}'s website${d}.`,
  none: (n) => `I came across ${n} while looking at local businesses.`,
};
export type WhyNowDraft = { from: string; subject: string; body: string; issues: string[]; alerts: string[]; triggerAgeDays?: number; onTrigger: boolean; variant: string };
export function composeWhyNow(p: WhyNowInput): WhyNowDraft {
  const now = p.now ?? Date.now();
  const age = triggerAgeDays(p.trigger, now);
  const d = p.trigger.date ? " on " + p.trigger.date : "";
  const opening = TRIGGER_LINE[p.trigger.type](p.name, d);
  const fact = p.facts.find(f => f.sourceUrl);
  const gap = p.gap[0];
  const paid = p.trigger.type === "ad_launch" ? " You're paying to send people to a page that doesn't convert yet." : "";
  const lines = ["Hi there,", "", opening + (p.trigger.source ? ` (source: ${p.trigger.source})` : "")];
  if (gap) lines.push("", "Found it: " + gap.replace(/^Gap:\s*/, "") + "." + paid);
  if (fact) lines.push("", `I built around what customers already say: ${fact.text} (${fact.sourceUrl}).`);
  lines.push("", "Fix it: I made a private DEMO site for " + p.name + "." + (p.demoUrl ? " " + p.demoUrl : " I can send the private link.") + " It's not published anywhere, and if you want it, it's yours: your code, your domain, live within hours.", "", "Worth a 15-minute call?", "", "Johnny");
  const address = (p.postalAddress ?? POSTAL_ADDRESS).trim();
  const footer = ["", "--", "MPLS Johnny Cage · " + SENDER];
  if (address) footer.push(address);
  footer.push(p.optOutUrl ? "Unsubscribe with one click: " + p.optOutUrl : 'Reply "no thanks" to opt out.');
  const body = lines.join("\n") + footer.join("\n");
  const issues: string[] = []; const alerts: string[] = [];
  if (!address) { issues.push("Missing postal address (CAN-SPAM)"); alerts.push("ALERT: postal address missing; draft blocked until set"); }
  if (!p.optOutUrl) issues.push("Missing one-click opt-out link");
  if (p.trigger.type !== "none" && !p.trigger.source) issues.push("Trigger has no source link");
  issues.push(...claimCheck(body, p.facts, p.trigger));
  return { from: SENDER, subject: `Found it, fixed it: ${p.name}`.slice(0, 180), body, issues, alerts, triggerAgeDays: age, onTrigger: age !== undefined && age <= ON_TRIGGER_DAYS, variant: "whynow-v1:" + p.trigger.type };
}
/** Claim-vs-source check: risky claims must not appear and every URL quoted must be a known source. */
export function claimCheck(body: string, facts: Fact[], trigger: Trigger): string[] {
  const out: string[] = [];
  if (/guarantee|#1|best in|we audited|double your|10x/i.test(body)) out.push("Unsupported marketing claim");
  const allowed = new Set([...facts.map(f => f.sourceUrl), trigger.source].filter(Boolean) as string[]);
  for (const m of body.matchAll(/\(source: ([^)]+)\)|\((https?:[^)]+)\)/g)) { const u = m[1] ?? m[2]; if (!allowed.has(u)) out.push("Unsourced link: " + u); }
  return out;
}

// ---------- Item 1/23: outcomes + metrics ----------
export type OutcomeKind = "sent" | "opened" | "viewed" | "replied" | "call_booked" | "paid" | "live" | "lost";
export type OutcomeEvent = { prospectId: string; kind: OutcomeKind; at: number; amount?: number; intent?: string; reason?: string };
export type StageCost = { stage: string; usd: number; computeSeconds: number; tool?: string; prospectId?: string };
export type SendSnapshotInput = { gates?: Gates; lookalike?: number; trigger: Trigger; demoVersion?: string; variant: string; subject: string; sentAt: number };
export function metrics(events: OutcomeEvent[], costs: StageCost[], snapshots: (SendSnapshotInput & { prospectId: string })[], qualifiedCount: number) {
  const by = (k: OutcomeKind) => new Set(events.filter(e => e.kind === k).map(e => e.prospectId));
  const sent = by("sent"), viewed = by("viewed"), replied = by("replied"), calls = by("call_booked"), paid = by("paid");
  const rate = (a: number, b: number) => (b ? a / b : 0);
  const total = costs.reduce((s, c) => s + c.usd, 0);
  const live = events.filter(e => e.kind === "live").map(l => { const p = events.find(e => e.kind === "paid" && e.prospectId === l.prospectId); return p ? (l.at - p.at) / 3_600_000 : undefined; }).filter((x): x is number => x !== undefined);
  const onTrig = snapshots.filter(s => { const a = triggerAgeDays(s.trigger, s.sentAt); return a !== undefined && a <= ON_TRIGGER_DAYS; }).length;
  return {
    costPerQualified: rate(total, qualifiedCount), totalCostUsd: total,
    demoToReply: rate(replied.size, sent.size), viewRate: rate(viewed.size, sent.size), replyToCall: rate(calls.size, replied.size), callToClose: rate(paid.size, calls.size),
    hoursPayToLive: live.length ? live.reduce((a, b) => a + b, 0) / live.length : undefined,
    onTriggerShare: rate(onTrig, snapshots.length),
    revenue: events.filter(e => e.kind === "paid").reduce((s, e) => s + (e.amount ?? 0), 0),
  };
}

// ---------- Item 22: lookalike to past winners + outcome calibration ----------
export function gateVector(g: Gates): number[] { return [g.fit, g.gap, g.spend, g.care, g.timing].map(x => x / 100); }
export function lookalike(g: Gates, winners: Gates[]): number {
  if (!winners.length) return 0;
  const a = gateVector(g); const na = Math.hypot(...a) || 1;
  return Math.round(100 * Math.max(...winners.map(w => { const b = gateVector(w); const nb = Math.hypot(...b) || 1; return a.reduce((s, x, i) => s + x * b[i], 0) / (na * nb); })));
}
/** Re-weight gates from labels: weight ~ (mean gate among wins - mean among losses), floored, normalised. */
export function calibrateWeights(labeled: { gates: Gates; won: boolean }[], prior = [0.2, 0.25, 0.2, 0.15, 0.2]): number[] {
  const wins = labeled.filter(l => l.won), losses = labeled.filter(l => !l.won);
  if (wins.length < 5 || losses.length < 5) return prior;
  const mean = (xs: typeof labeled, i: number) => xs.reduce((s, l) => s + gateVector(l.gates)[i], 0) / xs.length;
  const raw = prior.map((p, i) => Math.max(0.05, p + (mean(wins, i) - mean(losses, i))));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map(x => +(x / sum).toFixed(3));
}

// ---------- Item 6: promote gate ----------
export function shouldPromote(r: RawRecord, g: GateResult, existingKeys: Set<string>): { promote: boolean; reason: string } {
  if (!r.sourceUrl) return { promote: false, reason: "no source link" };
  if (existingKeys.has(r.identityKey)) return { promote: false, reason: "duplicate identity" };
  if (!g.passed) return { promote: false, reason: "failed gates" };
  return { promote: true, reason: "tier " + g.tier };
}

// ---------- Item 9: demo QA hard gates ----------
export function demoQa(html: string, facts: Fact[] = []): { pass: boolean; failures: string[] } {
  const h = html.toLowerCase(); const f: string[] = [];
  if (!/\bdemo\b/.test(h.replace(/<[^>]+>/g, " "))) f.push("No visible DEMO label");
  if (!/<meta[^>]+name=["']robots["'][^>]+noindex/.test(h)) f.push("Missing noindex");
  if (/guarantee|#1 rated|best in (?:town|the)/.test(h)) f.push("Unsourced claim");
  if (facts.length && !facts.some(x => h.includes(x.text.toLowerCase().slice(0, 30)))) f.push("No sourced fact rendered");
  if (!/<(?:form|a)[^>]+(?:book|quote|contact|tel:)/.test(h)) f.push("No working CTA");
  return { pass: !f.length, failures: f };
}

// ---------- Item 11: reply intent ----------
export type Intent = "opt_out" | "interested" | "price" | "not_now" | "wrong_person" | "other";
export function classifyReply(text: string): { intent: Intent; route: "suppress" | "johnny" | "nurture" } {
  const t = text.toLowerCase();
  if (/unsubscribe|no thanks|stop|remove me|not interested|don't contact/.test(t)) return { intent: "opt_out", route: "suppress" };
  if (/how much|price|cost|quote/.test(t)) return { intent: "price", route: "johnny" };
  if (/call|interested|sounds good|let's talk|yes|tell me more|available/.test(t)) return { intent: "interested", route: "johnny" };
  if (/later|next (?:month|year|quarter)|busy|not right now/.test(t)) return { intent: "not_now", route: "nurture" };
  if (/wrong person|not the owner|forward/.test(t)) return { intent: "wrong_person", route: "nurture" };
  return { intent: "other", route: "johnny" };
}

// ---------- Item 15: staleness recheck before draft ----------
export function recheck(prev: { site: SiteHealth; trigger: Trigger }, cur: { site: SiteHealth; trigger: Trigger }, now = Date.now()): "drop" | "upgrade" | "rerank" | "keep" {
  if (prev.site.state !== "ok" && cur.site.state === "ok") return "drop";
  if (cur.site.state === "dead" && prev.site.state !== "dead") return "upgrade";
  const a = triggerAgeDays(cur.trigger, now);
  if (a !== undefined && a > ON_TRIGGER_DAYS) return "rerank";
  return "keep";
}

// ---------- Item 4 spend flag ----------
export function paidSourceAllowed(env: Record<string, string | undefined>): boolean { return env.ALLOW_PAID_SOURCES === "true"; }

// ---------- Item 4/12: city permit feeds (Minneapolis CCS_Permits, St. Paul Building_Permits_) ----------
export type PermitFeed = { source: "mpls_open_data" | "stp_open_data"; layerUrl: string; dateField: string; nameField: string; cityField?: string; addressField?: string; typeFields: string[]; valueField?: string; defaultCity: string };
export const PERMIT_FEEDS: Record<"mpls" | "stp", PermitFeed> = {
  mpls: { source: "mpls_open_data", layerUrl: "https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/CCS_Permits/FeatureServer/0", dateField: "issueDate", nameField: "applicantName", cityField: "applicantCity", typeFields: ["permitType", "comments"], valueField: "permit_Value", defaultCity: "Minneapolis" },
  stp: { source: "stp_open_data", layerUrl: "https://services1.arcgis.com/9meaaHE3uiba0zr8/arcgis/rest/services/Building_Permits_/FeatureServer/0", dateField: "ISSUEDATE", nameField: "CONTRACTORNAME", addressField: "CONTRACTORADDRESS", typeFields: ["FOLDER_TYPE", "FOLDERDESCRIPTION"], valueField: "EST_VALUE_OF_WORK", defaultCity: "Saint Paul" },
};
export function permitQueryUrl(f: PermitFeed, sinceMs: number, limit = 200): string {
  const where = encodeURIComponent(`${f.dateField} >= DATE '${new Date(sinceMs).toISOString().slice(0, 10)}'`);
  return `${f.layerUrl}/query?where=${where}&outFields=*&orderByFields=${f.dateField}%20DESC&resultRecordCount=${Math.max(1, Math.min(1000, limit))}&returnGeometry=false&f=json`;
}
const TRADE_WORDS: [RegExp, string][] = [[/roof/i, "roofing"], [/plumb|gasfit|water heater/i, "plumbing"], [/mechanical|hvac|furnace|heating|air cond/i, "hvac"], [/electric/i, "electrical"], [/mason|chimney|concrete/i, "masonry"], [/window|siding|door/i, "windows and siding"], [/remodel|kitchen|bath|basement/i, "remodeling"], [/deck|fence|garage/i, "carpentry"], [/demoli/i, "demolition"], [/solar/i, "solar"]];
export function inferTrade(text: string): string { return TRADE_WORDS.find(([re]) => re.test(text))?.[1] ?? "general contractor"; }
const BIZ_WORD = /\b(?:inc|llc|co|company|corp|plbg|plumbing|roofing|heating|electric|masonry|construction|services?|homes?|builders?|exteriors?|mechanical|air|remodeling|contracting|restoration|solar|windows?|design|renovations?)\b/i;
const PERSON_ONLY = /^[A-Z][A-Za-z.'-]+\s+[A-Z][A-Za-z.'-]+$/;
/** St. Paul lists "FIRST LAST BUSINESS NAME"; keep the business part when a business word is present. */
export function cleanContractorName(raw: string): string {
  const n = raw.replace(/\s+/g, " ").trim();
  if (n !== n.toUpperCase()) return n;
  const m = n.match(/^(?:[A-Z]+\s+){1,2}([A-Z][A-Z&'. -]*(?:INC|LLC|CO|COMPANY|CORP|PLBG|PLUMBING|ROOFING|HEATING|ELECTRIC|MASONRY|CONSTRUCTION|SERVICES?|HOMES?|BUILDERS?|EXTERIORS?|MECHANICAL|AIR|REMODELING)\b.*)$/);
  const out = (m && m[1].split(" ").length >= 2 ? m[1] : n).replace(/\s+/g, " ").trim();
  return out.replace(/\w\S*/g, w => w.length <= 3 && /^(INC|LLC|CO)$/.test(w) ? w : w[0] + w.slice(1).toLowerCase());
}
/** Aggregate permit rows into one sourced record per contractor, trigger = latest permit. */
export function permitsToContractors(rows: Record<string, unknown>[], f: PermitFeed, fetchedAt = Date.now()): (RawRecord & { permitCount: number; permitValue: number })[] {
  const m = new Map<string, RawRecord & { permitCount: number; permitValue: number; _text: string }>();
  for (const r of rows) {
    const rawName = String(r[f.nameField] ?? "").trim();
    if (!rawName || /owner|homeowner|self|n\/a/i.test(rawName)) continue;
    const name = cleanContractorName(rawName);
    if (PERSON_ONLY.test(name) && !BIZ_WORD.test(name)) continue; // a person, not a business
    let city = f.cityField ? String(r[f.cityField] ?? "").trim() : "";
    if (!city && f.addressField) { const a = String(r[f.addressField] ?? ""); const mm = a.match(/\s([A-Z][A-Z .]+?)\s+MN\s+\d{5}/); city = mm ? mm[1].replace(/^.*?\b(?:AVE|ST|RD|BLVD|DR|LN|WAY|CT|PKWY|HWY|CIR|PL|TRL|STREET|AVENUE|ROAD)\b(?:\s+[NSEW]{1,2})?\s+/, "").trim() : ""; }
    city = city ? city.replace(/\bMPLS\b/i, "Minneapolis").replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()) : f.defaultCity;
    const key = identityKey({ name, city });
    const ms = Number(r[f.dateField]); const date = Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : undefined;
    const text = f.typeFields.map(k => String(r[k] ?? "")).join(" ");
    const value = Number(r[f.valueField ?? ""]) || 0;
    const prev = m.get(key);
    if (prev) { prev.permitCount++; prev.permitValue += value; prev._text += " " + text; if (date && (!prev.trigger?.date || date > prev.trigger.date)) prev.trigger = { type: "permit", date, source: f.layerUrl, detail: text.slice(0, 120) }; continue; }
    m.set(key, { id: f.source + ":" + key, identityKey: key, source: f.source, sourceUrl: f.layerUrl, fetchedAt, name, city, address: f.addressField ? String(r[f.addressField] ?? "") || undefined : undefined,
      trigger: date ? { type: "permit", date, source: f.layerUrl, detail: text.slice(0, 120) } : undefined, permitCount: 1, permitValue: value, _text: text });
  }
  return [...m.values()].map(({ _text, ...r }) => ({ ...r, trade: inferTrade(r.name + " " + _text) }));
}
