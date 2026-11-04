// Pure helpers for demo-view tracking and the public "book a call" page that sits behind a
// prospect's private demo link. No Convex imports, so they are unit tested directly.

const BOT_UA = /bot|crawl|spider|slurp|preview|scanner|fetch|headless|python|curl|wget|http-client|axios|node-fetch|go-http|java\/|okhttp|facebookexternalhit|whatsapp|telegram|discord|skype|microsoft office|outlook|google-safety|safelinks|proofpoint|mimecast|barracuda|symantec|zscaler|vercel-screenshot|lighthouse/i;

/** True for a real person opening the page in a browser, not a link scanner or preview bot. */
export function isHumanView(headers: { get(name: string): string | null }): boolean {
  const ua = headers.get("user-agent") ?? "";
  if (!ua || BOT_UA.test(ua)) return false;
  const dest = headers.get("sec-fetch-dest");
  if (dest && dest !== "document") return false;
  const accept = headers.get("accept") ?? "";
  return accept.includes("text/html") || dest === "document";
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** The floating "book a call" button added to every served demo. */
export function bookingCta(href: string, external: boolean): string {
  return `<a data-book-cta href="${esc(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""} style="position:fixed;right:16px;bottom:16px;z-index:2147483647;display:inline-flex;align-items:center;gap:8px;padding:14px 18px;border-radius:999px;background:#111;color:#fff;font:600 14px/1.2 ui-sans-serif,-apple-system,'Segoe UI',sans-serif;text-decoration:none;box-shadow:0 10px 30px rgba(0,0,0,.25)">Like it? Book a free 15-min call &rarr;</a>`;
}

export function injectBookingCta(html: string, href: string, external: boolean): string {
  if (html.includes("data-book-cta")) return html;
  const cta = bookingCta(href, external);
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, cta + "</body>") : html + cta;
}

import type { SystemSpec } from "./revenue-build";
const CORE = new Set(["name", "phone", "email", "preferred", "website", "note"]);
/** Segment fields beyond name/phone/email (quote address, intake reason, party size). File uploads are not taken on this page. */
export function segmentFields(spec?: SystemSpec) { return (spec?.fields ?? []).filter(f => !CORE.has(f.name) && f.type !== "file"); }
/** Validates the segment's required fields and folds them into the note so the bookings table stays unchanged. */
export function parseSegmentExtras(body: string, spec?: SystemSpec): { ok: true; note: string } | { ok: false; error: string } {
  const f = new URLSearchParams(body); const lines: string[] = [];
  for (const x of segmentFields(spec)) {
    const val = (f.get(x.name) ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 300);
    if (x.required && !val) return { ok: false, error: x.label + " is required." };
    if (val) lines.push(x.label + ": " + val);
  }
  return { ok: true, note: lines.join("\n") };
}
export type BookingInput = { name: string; phone: string; email: string; preferred: string; note: string };

export function parseBookingForm(body: string): { ok: true; value: BookingInput } | { ok: false; error: string; spam?: boolean } {
  const f = new URLSearchParams(body);
  if ((f.get("website") ?? "").trim()) return { ok: false, error: "Rejected", spam: true }; // honeypot
  const clean = (k: string, max: number) => (f.get(k) ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
  const value = { name: clean("name", 120), phone: clean("phone", 40), email: clean("email", 200), preferred: clean("preferred", 120), note: clean("note", 1000) };
  if (value.name.length < 2) return { ok: false, error: "Please add your name." };
  const phoneOk = value.phone.replace(/\D/g, "").length >= 10;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.email);
  if (!phoneOk && !emailOk) return { ok: false, error: "Please add a phone number or an email so we can reach you." };
  if (value.email && !emailOk) return { ok: false, error: "That email address doesn't look right." };
  return { ok: true, value };
}

const PAGE_CSS = "*{box-sizing:border-box}body{margin:0;background:#f6f5f2;color:#161616;font:16px/1.55 ui-sans-serif,-apple-system,'Segoe UI',sans-serif}main{max-width:520px;margin:0 auto;padding:40px 20px}h1{font-size:28px;line-height:1.15;margin:0 0 8px}p{color:#4b4b4b}form{background:#fff;border:1px solid #e5e2da;border-radius:16px;padding:22px;margin-top:20px;display:grid;gap:14px}label{display:grid;gap:6px;font-weight:600;font-size:14px}input,textarea,select{font:inherit;padding:12px;border:1px solid #d6d2c8;border-radius:10px;width:100%;background:#fff}input:focus,textarea:focus,select:focus{outline:3px solid #111;outline-offset:1px}button{font:600 16px/1 inherit;padding:15px;border:0;border-radius:999px;background:#111;color:#fff;cursor:pointer}.hp{position:absolute;left:-9999px}.err{background:#fde8e8;color:#8a1c1c;padding:10px 12px;border-radius:10px}.fine{font-size:12px;color:#777}a{color:#111}";

export function bookingPage(opts: { businessName: string; senderBrand: string; demoHref: string; error?: string; values?: Partial<BookingInput> & Record<string, string>; system?: SystemSpec }): string {
  const v: Record<string, string | undefined> = opts.values ?? {};
  const extra = segmentFields(opts.system).map(x => `<label>${esc(x.label)}${x.required ? "" : ' <span class="fine">(optional)</span>'}<input name="${esc(x.name)}" type="${x.type === "datetime-local" ? "datetime-local" : "text"}" maxlength="300"${x.required ? " required" : ""} value="${esc(v[x.name] ?? "")}"></label>`).join("\n");
  const val = (k: keyof BookingInput) => esc(v[k] ?? "");
  const heading = opts.system ? esc(opts.system.title) : "Let's talk about your new website";
  const options = ["As soon as possible", "Weekday morning", "Weekday afternoon", "Weekday evening", "Saturday"];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Book a call · ${esc(opts.senderBrand)}</title><style>${PAGE_CSS}</style></head><body><main>
<h1>${heading}</h1>
<p>Thanks for looking at the concept we made for <b>${esc(opts.businessName)}</b>. Leave your details and ${esc(opts.senderBrand)} will reach out to set up a free 15-minute call. No obligation.</p>
<form method="post">${opts.error ? `<div class="err" role="alert">${esc(opts.error)}</div>` : ""}
<label>Your name<input name="name" autocomplete="name" required maxlength="120" value="${val("name")}"></label>
<label>Phone<input name="phone" type="tel" autocomplete="tel" maxlength="40" value="${val("phone")}"></label>
<label>Email<input name="email" type="email" autocomplete="email" maxlength="200" value="${val("email")}"></label>
${extra}
<label>Best time for a call<select name="preferred">${options.map(o => `<option${v.preferred === o ? " selected" : ""}>${o}</option>`).join("")}</select></label>
<label>Anything we should know? <span class="fine">(optional)</span><textarea name="note" rows="3" maxlength="1000">${val("note")}</textarea></label>
<label class="hp" aria-hidden="true">Leave empty<input name="website" tabindex="-1" autocomplete="off"></label>
<button type="submit">Request my call</button>
<p class="fine">We'll only use this to contact you about your website. Phone or email is enough.</p>
</form>
<p><a href="${esc(opts.demoHref)}">&larr; Back to the concept</a></p>
</main></body></html>`;
}

export function bookingThanksPage(opts: { businessName: string; senderBrand: string; demoHref: string }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Thanks · ${esc(opts.senderBrand)}</title><style>${PAGE_CSS}</style></head><body><main>
<h1>Thanks, we got it.</h1>
<p>${esc(opts.senderBrand)} will reach out shortly to set up your free 15-minute call about a new website for <b>${esc(opts.businessName)}</b>.</p>
<p><a href="${esc(opts.demoHref)}">&larr; Back to the concept</a></p>
</main></body></html>`;
}

export const BOOKING_CSP = ["default-src 'none'", "style-src 'unsafe-inline'", "form-action 'self'", "base-uri 'none'", "frame-ancestors 'none'"].join("; ");
