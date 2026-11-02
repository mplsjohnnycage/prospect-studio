// Turns a sourced BusinessProfile into a prompt for a custom one-page demo site, then checks the
// model's HTML before it is stored: structure, safety (no external scripts or images), taste
// rules, and that every phone, email and rating in the page is one we actually verified.
import type {BusinessProfile} from "./business-profile";

export type DemoFacts = {
  name: string; trade: string; city: string; currentWebsite?: string;
  phone?: string; email?: string; address?: string; hours?: string[];
  services: string[]; trustSignals: string[]; voice: string[];
  rating?: {score: number; count?: number}; reviewQuote?: string; palette: string[];
};
export type Direction = {variant: string; direction: string; description: string};

export function buildDemoFacts(prof: BusinessProfile, contact = ""): DemoFacts {
  const manualPhone = !prof.phones.length && /^[\d()+\-\s.]{7,}$/.test(contact.trim()) ? contact.trim() : undefined;
  const manualEmail = !prof.emails.length && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim()) ? contact.trim() : undefined;
  return {
    name: prof.name, trade: prof.category, city: prof.city, currentWebsite: prof.website,
    phone: prof.phones[0]?.value ?? manualPhone, email: prof.emails[0]?.value ?? manualEmail,
    address: prof.address?.value, hours: prof.hours?.lines,
    services: prof.services.map(s => s.value), trustSignals: prof.trust.map(t => t.value), voice: prof.tone.map(t => t.label),
    rating: prof.rating ? {score: prof.rating.score, count: prof.rating.count} : undefined,
    reviewQuote: prof.quote?.value, palette: prof.palette.map(p => p.value),
  };
}

export const DEMO_SYSTEM_PROMPT = `You are a senior web designer and front-end engineer building a one-page website concept for a real local service business. Output ONE complete, self-contained HTML document and nothing else.

Hard rules:
1. Facts: use only the business facts in the brief. Never invent phone numbers, emails, street addresses, prices, star ratings, review counts, testimonials, years in business, licenses, awards, staff names or service areas that are not in the brief. When a fact is missing, design around it (for example a "Request a free quote" form instead of a phone number). General marketing copy about the trade is fine as long as it makes no factual claim about this business.
2. Format: start with <!doctype html> and end with </html>. No markdown fences and no commentary. Put all CSS in one <style> in the head and all JavaScript in one inline <script> at the end of the body. Keep the file under 45,000 characters: be concise in CSS and avoid repetition.
3. External resources: none, except optionally one Google Fonts stylesheet <link> from https://fonts.googleapis.com (with preconnects). No images from the web. Use CSS, gradients and inline SVG for visuals. No external scripts, iframes, trackers or analytics.
4. Typography: never use Inter, Roboto, Arial, Helvetica or system-ui as a primary font. Choose a distinctive pairing that suits the trade and tone.
5. Craft must hold through the whole page, not just the hero. Build at least 6 distinct <section> elements, each with its own layout: a hero with one clear primary call to action, services, process or why-us, proof (only the verified rating, quote and trust signals if provided; otherwise a "what to expect" section), service area and contact details, a quote request form, and a footer. Do not repeat the same three-card grid. Use real visual hierarchy, generous spacing and specific, confident copy.
6. Interactivity in vanilla JS: a mobile navigation toggle, smooth in-page navigation, at least one interactive component (tabs, an accordion FAQ, or a simple project-scope estimator without prices), and a quote form with client-side validation that shows an in-page thank-you message. The form must never submit anywhere: no action attribute, and call preventDefault.
7. Accessibility and responsiveness: semantic landmarks, labelled inputs, visible focus states, AA contrast, and a layout that works from 375px to 1440px wide.
8. Color: if a brand palette is provided, build the theme from it. Otherwise choose a tasteful palette that fits the trade and the voice.
9. This is a private concept, not the official site. Do not say it is official.
10. When a design system is given, follow it exactly: its fonts, its CSS variables, its look and its section plan.

Polish that separates a designed site from a template (check each before you answer):
- One clear H1; a type scale built from the --step variables; headings in the display font, text in the body font.
- A consistent spacing rhythm from the --space variables; sections alternate background (var(--bg) / var(--surface) / one accent band) so the page has rhythm.
- Content aligned to one max-width container; text measure under 70 characters.
- Buttons with hover, active and focus-visible states; links distinguishable; tap targets at least 44px.
- Inline SVG icons drawn in one consistent style (same stroke width and corner style), sized to the text.
- A sticky header that shrinks on scroll, with the primary CTA always visible on mobile.
- Copy that is specific to this trade and city (materials, problems, seasons, neighborhoods if verified), never generic filler like "We are committed to excellence".
- Subtle motion only: elements fade/slide in once with IntersectionObserver, and prefers-reduced-motion disables it.`;

export function buildDemoPrompt(facts: DemoFacts, direction: Direction, gaps: string[], previousErrors: string[] = [], designBrief = ""): string {
  const fix = gaps.length ? gaps.map(g => "- " + g).join("\n") : "- (no specific problems recorded)";
  const retry = previousErrors.length
    ? `\n\nYour previous attempt was rejected for these reasons. Fix every one:\n${previousErrors.map(e => "- " + e).join("\n")}`
    : "";
  const design = designBrief ? `\n\n${designBrief}` : "";
  return `Design direction: ${direction.direction} (${direction.variant}): ${direction.description}${design}

Problems with their current web presence that this concept should fix:
${fix}

Business brief. Every field below was verified from a public source; fields that are absent are unknown and must not be invented:
${JSON.stringify(facts, null, 2)}${retry}`;
}

export function extractHtml(text: string): string {
  let t = text.trim().replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = t.search(/<!doctype html/i);
  if (start > 0) t = t.slice(start);
  const end = t.toLowerCase().lastIndexOf("</html>");
  if (end >= 0) t = t.slice(0, end + "</html>".length);
  return t;
}

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?([2-9]\d{2})[\s.-]?(\d{4})\b/g;
const EMAIL_RE = /[a-z0-9][a-z0-9._%+-]{0,62}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const digits = (s: string) => s.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

/** Visible text and attributes, without style, script and SVG blocks (numbers by design) or form placeholders (sample input, not claims). */
function contentOnly(html: string): string {
  return html.replace(/\splaceholder\s*=\s*("[^"]*"|'[^']*')/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<svg[\s\S]*?<\/svg>/gi, " ");
}
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;|&apos;|&rsquo;/g, "'").replace(/&quot;/g, '"');

export function validateDemoHtml(html: string, facts: DemoFacts): {ok: boolean; errors: string[]} {
  const errors: string[] = [];
  if (!/^<!doctype html>/i.test(html)) errors.push("Must start with <!doctype html>");
  if (!/<\/html>\s*$/i.test(html)) errors.push("Must end with </html>");
  if (html.length < 3000) errors.push("Page is too short to be a full concept");
  if (html.length > 150_000) errors.push("Page is over 150,000 characters; keep it under 60,000");
  if (/<script\b[^>]*\bsrc\s*=/i.test(html)) errors.push("External script found; inline all JavaScript");
  if (/<(?:iframe|object|embed|base)\b/i.test(html)) errors.push("iframe, object, embed and base tags are not allowed");
  for (const link of html.match(/<link\b[^>]*>/gi) ?? []) {
    const href = link.match(/href\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
    if (!/^https:\/\/fonts\.(?:googleapis|gstatic)\.com(?:\/|$)/i.test(href)) errors.push("Only Google Fonts links are allowed: " + href.slice(0, 80));
  }
  if (/<form\b[^>]*\baction\s*=/i.test(html)) errors.push("The form must not have an action attribute");
  if (/<img\b[^>]*\bsrc\s*=\s*["']?https?:/i.test(html) || /url\(\s*["']?https?:/i.test(html)) errors.push("No images from the web; use CSS or inline SVG");
  if (!/<script\b[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(html)) errors.push("No inline interactivity script");
  if ((html.match(/<section\b/gi) ?? []).length < 5) errors.push("Needs at least 5 distinct <section> elements plus a footer");
  if (/font-family\s*:\s*["']?(?:inter|roboto|arial|helvetica|system-ui)\b/i.test(html)) errors.push("Banned primary font (Inter, Roboto, Arial, Helvetica or system-ui)");
  if (/lorem ipsum/i.test(html)) errors.push("Placeholder lorem ipsum text");
  const body = decode(contentOnly(html));
  if (!body.toLowerCase().includes(facts.name.toLowerCase())) errors.push("The business name must appear on the page");
  const allowedPhones = new Set([facts.phone].filter(Boolean).map(p => digits(p!)));
  for (const m of body.matchAll(PHONE_RE)) {
    const d = m[1] + m[2] + m[3];
    if (!allowedPhones.has(d)) { errors.push(`Unverified phone number on the page: ${m[0].trim()}`); break; }
  }
  const allowedEmails = new Set([facts.email].filter(Boolean).map(e => e!.toLowerCase()));
  for (const e of body.match(EMAIL_RE) ?? []) {
    if (!allowedEmails.has(e.toLowerCase())) { errors.push(`Unverified email address on the page: ${e}`); break; }
  }
  if (!facts.rating && /\b[1-5](?:\.\d)?\s*(?:\/\s*5\b|out of 5\b|stars?\b)|★★★/i.test(body)) errors.push("A star rating appears but no rating was verified");
  return {ok: errors.length === 0, errors};
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]!));

/** Adds noindex and a visible DEMO label. Safe to run more than once. */
export function finalizeDemoHtml(html: string, opts: {businessName: string; senderBrand: string}): string {
  let out = html;
  if (!/name=["']robots["']/i.test(out)) {
    const meta = '<meta name="robots" content="noindex,nofollow">';
    out = /<head\b[^>]*>/i.test(out) ? out.replace(/<head\b[^>]*>/i, m => m + meta) : out.replace(/<html\b[^>]*>/i, m => m + "<head>" + meta + "</head>");
  }
  if (!out.includes("data-demo-banner")) {
    const banner = `<div data-demo-banner role="note" style="position:sticky;top:0;z-index:2147483647;background:#111;color:#fff;font:600 12px/1.4 ui-sans-serif,sans-serif;letter-spacing:.02em;text-align:center;padding:8px 12px">DEMO · A private website concept for ${esc(opts.businessName)}, prepared by ${esc(opts.senderBrand)}. Not the official site.</div>`;
    out = /<body\b[^>]*>/i.test(out) ? out.replace(/<body\b[^>]*>/i, m => m + banner) : out;
  }
  return out;
}

// ---------- Art-director review and one fix pass ----------
export const DEMO_REVIEW_SYSTEM = `You are an exacting art director reviewing a one-page website concept for a local service business before it is shown to the owner. Judge it as a phone visitor first, then desktop. Be strict: 8 or more only if it would impress the owner at first glance and look custom-designed, not templated.

Reply with JSON only, no prose: {"score": <overall 1-10, one decimal>, "fixes": ["<specific, actionable change naming the section or selector>", ...]}
List at most 8 fixes, most important first. Focus on visual hierarchy, typography, spacing rhythm, color and contrast, layout variety between sections, hero impact, mobile layout (read the media queries), CTA clarity, and copy that sounds generic. Never ask to add facts (phone numbers, ratings, reviews, prices, years, licenses) that are not already in the page.`;

export function buildReviewPrompt(html: string, facts: DemoFacts): string {
  return `Business: ${facts.name}, a ${facts.trade} business in ${facts.city}.\n\nPage HTML:\n${html}`;
}

export function parseReview(text: string): {score: number; fixes: string[]} | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as {score?: unknown; fixes?: unknown};
    const score = typeof j.score === "number" ? j.score : parseFloat(String(j.score));
    if (!Number.isFinite(score)) return null;
    const fixes = Array.isArray(j.fixes) ? j.fixes.filter((f): f is string => typeof f === "string" && f.trim().length > 3).map(f => f.trim().slice(0, 300)).slice(0, 8) : [];
    return {score: Math.max(1, Math.min(10, Math.round(score * 10) / 10)), fixes};
  } catch { return null; }
}

export function buildFixPrompt(facts: DemoFacts, direction: Direction, gaps: string[], designBrief: string, html: string, fixes: string[]): string {
  return `${buildDemoPrompt(facts, direction, gaps, [], designBrief)}

An art director reviewed your page. Apply every fix below, keep everything that already works, and return the complete improved HTML document (all the same hard rules apply):
${fixes.map(f => "- " + f).join("\n")}

Current page:
${html}`;
}
