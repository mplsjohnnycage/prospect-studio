// Pure, offline-testable signals used by the discovery pipeline: contact extraction,
// website-opportunity scoring, search-query expansion, domain de-duplication and
// outreach compliance checks. Nothing here performs network I/O or sends anything.

// ---------- Contact extraction ----------
export type ContactInfo = { emails: string[]; phones: string[]; best: string };

const EMAIL_RE = /[a-z0-9][a-z0-9._%+-]{0,62}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const JUNK_EMAIL_DOMAINS = /(?:^|\.)(?:example\.(?:com|org)|sentry\.io|sentry-next\.wixpress\.com|wixpress\.com|godaddy\.com|squarespace\.com|schema\.org|w3\.org|domain\.com|yourdomain\.com|email\.com)$/i;
const JUNK_EMAIL_LOCAL = /^(?:noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster|webmaster|abuse|privacy|unsubscribe|u003e|name|email|user|your)$/i;
const IMAGE_SUFFIX = /\.(?:png|jpe?g|gif|webp|svg|ico|css|js)$/i;
const ROLE_LOCAL = /^(?:info|contact|office|hello|hi|estimates?|quotes?|service|services|sales|admin|support|team|inquiries|inquiry|bookings?)$/i;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?([2-9]\d{2})[\s.-]?(\d{4})\b/g;

export function siteKey(website: string): string {
  try {
    return new URL(website).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return website.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

/** Both the www and bare-host forms of an origin, so one business never becomes two prospects. */
export function websiteVariants(website: string): string[] {
  try {
    const u = new URL(website);
    const bare = u.hostname.toLowerCase().replace(/^www\./, "");
    return [...new Set([`${u.protocol}//${bare}/`, `${u.protocol}//www.${bare}/`, website])];
  } catch {
    return [website];
  }
}

export function extractContacts(text: string, website = ""): ContactInfo {
  const host = website ? siteKey(website) : "";
  const found = new Map<string, number>();
  for (const raw of text.match(EMAIL_RE) ?? []) {
    const email = raw.toLowerCase().replace(/[.,;:)\]]+$/, "");
    const [local, domain] = email.split("@");
    if (!local || !domain || IMAGE_SUFFIX.test(email)) continue;
    if (JUNK_EMAIL_DOMAINS.test(domain) || JUNK_EMAIL_LOCAL.test(local)) continue;
    let rank = 0;
    if (host && (domain === host || domain.endsWith("." + host))) rank += 2;
    if (ROLE_LOCAL.test(local)) rank += 1;
    found.set(email, Math.max(rank, found.get(email) ?? 0));
  }
  const emails = [...found.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(e => e[0]).slice(0, 5);
  const phones: string[] = [];
  for (const m of text.matchAll(PHONE_RE)) {
    const formatted = `(${m[1]}) ${m[2]}-${m[3]}`;
    if (!phones.includes(formatted)) phones.push(formatted);
    if (phones.length >= 3) break;
  }
  return { emails, phones, best: emails[0] ?? phones[0] ?? "" };
}

// ---------- Website opportunity ----------
export type Opportunity = { assessed: boolean; opportunity: number; reasons: string[] };

/**
 * How much a business could gain from a better site, judged only from the public text
 * we already have. Weak or thin sites score higher. When there is too little content to
 * judge, `assessed` is false and the value must not influence ranking.
 */
export function assessOpportunity(markdown: string, year = new Date().getFullYear()): Opportunity {
  const text = markdown.trim();
  if (text.length < 120) return { assessed: false, opportunity: 0, reasons: ["Opportunity: not enough site content to judge"] };
  const lower = text.toLowerCase();
  const reasons: string[] = [];
  let points = 0;
  const add = (n: number, why: string) => { points += n; reasons.push("Opportunity: " + why); };

  if (/\b(?:under construction|coming soon|site is being (?:updated|rebuilt)|check back soon)\b/.test(lower)) add(30, "site says under construction or coming soon");
  if (text.length < 600) add(20, "very thin homepage content");
  else if (text.length < 1500) add(10, "limited homepage content");

  const years = [...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(20\d{2}|19\d{2})/gi)].map(m => Number(m[1]));
  if (years.length && year - Math.max(...years) >= 3) add(20, `footer copyright is ${Math.max(...years)}, so the site looks stale`);

  if (!/\b(?:contact|call us|call today|request (?:a )?quote|free (?:estimates?|quotes?)|get (?:a )?quotes?|book (?:now|online)|schedule)\b/.test(lower)) add(20, "no clear call to action or quote path");
  if (!PHONE_RE.test(text)) add(10, "no phone number visible");
  PHONE_RE.lastIndex = 0;
  if (!/\b(?:reviews?|testimonials?|rated|5[- ]star|five[- ]star|licensed|insured|bonded|bbb|years? (?:of )?experience|family[- ]owned)\b/.test(lower)) add(10, "no visible reviews or trust signals");
  if (!/\b(?:services|what we do|our work|projects|portfolio|gallery)\b/.test(lower)) add(10, "no clear services or portfolio section");
  if (/\b(?:wix|godaddy|squarespace|weebly|site123|webs\.com|jimdo)\b|powered by|website builder/.test(lower)) add(10, "built on a generic site builder");

  return { assessed: true, opportunity: Math.min(100, points), reasons };
}

/**
 * Ranking score for top-decile selection: fit stays the majority weight and opportunity
 * can only nudge it. Unassessed prospects keep their fit score unchanged.
 */
export function rankScore(fit: number, opportunity?: number): number {
  if (opportunity === undefined || !Number.isFinite(opportunity)) return fit;
  const o = Math.max(0, Math.min(100, opportunity));
  return Math.round(0.8 * fit + 0.2 * o);
}

// ---------- Search expansion ----------
const SYNONYMS: [RegExp, string][] = [
  [/paint/i, "house painters"],
  [/plumb/i, "plumber"],
  [/roof/i, "roofing company"],
  [/hvac|heating|furnace|air cond/i, "heating and air conditioning"],
  [/electric/i, "electrician"],
  [/landscap|lawn/i, "landscaping company"],
  [/clean|janitor|maid/i, "cleaning service"],
  [/concrete|masonry|brick/i, "concrete contractor"],
  [/floor/i, "flooring installer"],
  [/remodel|construct|builder|carpent/i, "remodeling contractor"],
  [/pest|exterminat/i, "pest control"],
  [/garage/i, "garage door repair"],
  [/window|siding|gutter/i, "exterior home improvement"],
];

export function buildSearchQueries(trade: string, city: string, max = 3): string[] {
  const t = trade.trim(), c = city.trim();
  const cap = Math.max(1, Math.min(4, Math.floor(max) || 3));
  const term = SYNONYMS.find(([re]) => re.test(t))?.[1] ?? t;
  const candidates = [
    `${t} business ${c} official website`,
    `${t} contractor services ${c} locally owned`,
    `${term} ${c} free estimate`,
    `${term} near ${c} family owned`,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of candidates) {
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= cap) break;
  }
  return out;
}

// ---------- Outreach compliance ----------
export type OutreachFooterOptions = { postalAddress?: string; senderName?: string };

export function outreachFooter(opts: OutreachFooterOptions = {}): string {
  const name = (opts.senderName ?? "MPLS Johnny Cage").trim();
  const address = (opts.postalAddress ?? "").replace(/\s*\n\s*/g, ", ").trim();
  const lines = ["", "--", name];
  if (address) lines.push(address);
  lines.push('If you would rather not hear from me, just reply "no thanks" and I will not contact you again.');
  return lines.join("\n");
}

/** Problems that must be fixed before a draft may ever be sent. Never blocks drafting. */
export function outreachIssues(body: string, opts: OutreachFooterOptions = {}): string[] {
  const issues: string[] = [];
  if (!(opts.postalAddress ?? "").trim()) issues.push("Missing physical postal address (required by CAN-SPAM); set OUTREACH_POSTAL_ADDRESS before sending");
  if (!/\b(?:no thanks|unsubscribe|opt[- ]out|not hear from me)\b/i.test(body)) issues.push("Missing opt-out line");
  return issues;
}

const SUBJECTS = [
  (n: string) => `A private website concept for ${n}`,
  (n: string) => `A quick website idea for ${n}`,
  (n: string) => `${n}: a website concept I put together`,
];
export function pickSubject(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SUBJECTS[h % SUBJECTS.length](name).slice(0, 180);
}
