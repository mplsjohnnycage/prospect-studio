// Price list and proposal pages. Pure helpers (no Convex imports).

export type Package = { id: string; name: string; setup: number; monthly: number; includes: string[]; paymentUrl?: string };

/**
 * Starting price list, based on 2026 US market ranges for small trades websites (freelancer
 * custom builds roughly $1.5k-$8k, one-page contractor sites $500-$2.5k, care plans $49-$300/mo).
 * Johnny edits these in Settings; nothing is ever quoted to a prospect automatically.
 */
export const DEFAULT_PACKAGES: Package[] = [
  { id: "starter", name: "Starter", setup: 1200, monthly: 49, includes: ["Your demo finished and launched as a one-page site", "Mobile-first design, quote request form to your email", "Domain connection, SSL and hosting", "Google Business Profile link-up", "Small text and photo updates each month"] },
  { id: "growth", name: "Growth", setup: 2500, monthly: 99, includes: ["Everything in Starter", "Up to 5 pages: home, services, about, reviews, contact", "Service-area pages for your top towns", "Local SEO setup (schema, titles, Google Search Console)", "Real photos of your work added"] },
  { id: "pro", name: "Pro", setup: 4500, monthly: 149, includes: ["Everything in Growth", "Up to 12 pages with a project gallery", "Instant lead alerts by text and email", "Review request flow for happy customers", "Monthly performance report"] },
];

export function validatePackages(input: unknown): Package[] {
  if (!Array.isArray(input) || !input.length || input.length > 6) throw new Error("Add 1 to 6 packages");
  const seen = new Set<string>();
  return input.map((raw, i) => {
    const p = raw as Partial<Package>;
    const name = String(p.name ?? "").trim().slice(0, 40);
    if (!name) throw new Error(`Package ${i + 1} needs a name`);
    const setup = Number(p.setup), monthly = Number(p.monthly ?? 0);
    if (!Number.isFinite(setup) || setup < 0 || setup > 100_000) throw new Error(`${name}: setup price must be 0 to 100,000`);
    if (!Number.isFinite(monthly) || monthly < 0 || monthly > 10_000) throw new Error(`${name}: monthly price must be 0 to 10,000`);
    const id = (String(p.id ?? "").trim() || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "pkg-" + (i + 1);
    if (seen.has(id)) throw new Error("Package names must be different");
    seen.add(id);
    const includes = (Array.isArray(p.includes) ? p.includes : []).map(x => String(x).trim().slice(0, 140)).filter(Boolean).slice(0, 12);
    const paymentUrl = String(p.paymentUrl ?? "").trim();
    if (paymentUrl && !/^https:\/\/[^\s]+$/.test(paymentUrl)) throw new Error(`${name}: payment link must start with https://`);
    return { id, name, setup: Math.round(setup), monthly: Math.round(monthly), includes, ...(paymentUrl ? { paymentUrl: paymentUrl.slice(0, 500) } : {}) };
  });
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const money = (n: number) => "$" + n.toLocaleString("en-US");

const CSS = "*{box-sizing:border-box}body{margin:0;background:#f6f5f2;color:#161616;font:16px/1.55 ui-sans-serif,-apple-system,'Segoe UI',sans-serif}main{max-width:980px;margin:0 auto;padding:40px 20px 80px}h1{font-size:30px;line-height:1.15;margin:0 0 8px}p{color:#4b4b4b;max-width:65ch}.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));margin-top:24px}.card{background:#fff;border:1px solid #e5e2da;border-radius:16px;padding:22px;display:flex;flex-direction:column;gap:12px}.card h2{margin:0;font-size:20px}.price{font-size:28px;font-weight:700}.price small{font-size:14px;font-weight:500;color:#666}ul{margin:0;padding-left:18px;color:#333}li{margin:4px 0}form{display:grid;gap:10px;margin-top:auto}label{display:grid;gap:4px;font-size:13px;font-weight:600}input{font:inherit;padding:10px;border:1px solid #d6d2c8;border-radius:10px}button,.btn{font:600 15px/1 inherit;padding:14px;border:0;border-radius:999px;background:#111;color:#fff;cursor:pointer;text-align:center;text-decoration:none;display:block}.note{background:#fff;border:1px solid #e5e2da;border-radius:12px;padding:14px 16px;margin-top:16px;white-space:pre-wrap}.ok{background:#e9f7ef;border:1px solid #bfe5cf;border-radius:16px;padding:22px}.check{display:flex;gap:8px;align-items:flex-start;font-weight:500}.fine{font-size:12px;color:#777}a{color:#111}";

export function proposalPage(o: { business: string; senderBrand: string; packages: Package[]; note?: string; demoHref?: string; error?: string }): string {
  const cards = o.packages.map(p => `<div class="card"><h2>${esc(p.name)}</h2><div class="price">${money(p.setup)} <small>to build</small></div>${p.monthly ? `<div><b>+ ${money(p.monthly)}/month</b> <span class="fine">hosting, care and updates</span></div>` : ""}<ul>${p.includes.map(i => `<li>${esc(i)}</li>`).join("")}</ul>
<form method="post"><input type="hidden" name="package" value="${esc(p.id)}"><label>Your name<input name="name" required maxlength="120" autocomplete="name"></label><label>Email<input name="email" type="email" required maxlength="200" autocomplete="email"></label><label class="check"><input type="checkbox" name="agree" value="yes" required> I'd like to go ahead with ${esc(p.name)}</label><input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true"><button type="submit">Choose ${esc(p.name)}</button></form></div>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Website proposal · ${esc(o.business)}</title><style>${CSS}</style></head><body><main>
<p class="fine">${esc(o.senderBrand)} · Proposal</p><h1>A new website for ${esc(o.business)}</h1>
<p>Here are the options we talked about. Pick the one that fits and we'll get started. Nothing is charged until we confirm the details together.</p>
${o.demoHref ? `<p><a href="${esc(o.demoHref)}">See the concept again &rarr;</a></p>` : ""}${o.note ? `<div class="note">${esc(o.note)}</div>` : ""}${o.error ? `<p class="note" role="alert" style="color:#8a1c1c">${esc(o.error)}</p>` : ""}
<div class="grid">${cards}</div></main></body></html>`;
}

export function proposalAcceptedPage(o: { business: string; senderBrand: string; pkg: Package }): string {
  const pay = o.pkg.paymentUrl ? `<p><a class="btn" href="${esc(o.pkg.paymentUrl)}" rel="noopener noreferrer">Pay the deposit to reserve your spot &rarr;</a></p>` : `<p>${esc(o.senderBrand)} will reach out within one business day with next steps.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Thank you · ${esc(o.business)}</title><style>${CSS}</style></head><body><main><div class="ok"><h1>You're in. Thank you!</h1><p>You chose <b>${esc(o.pkg.name)}</b> (${money(o.pkg.setup)}${o.pkg.monthly ? ` + ${money(o.pkg.monthly)}/month` : ""}) for ${esc(o.business)}.</p>${pay}</div></main></body></html>`;
}

export function parseAcceptForm(body: string, packages: Package[]): { ok: true; pkg: Package; name: string; email: string } | { ok: false; error: string; spam?: boolean } {
  const f = new URLSearchParams(body);
  if ((f.get("website") ?? "").trim()) return { ok: false, error: "Rejected", spam: true };
  const pkg = packages.find(p => p.id === f.get("package"));
  if (!pkg) return { ok: false, error: "Please choose one of the packages." };
  const name = (f.get("name") ?? "").trim().slice(0, 120), email = (f.get("email") ?? "").trim().slice(0, 200);
  if (name.length < 2) return { ok: false, error: "Please add your name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: "Please add a valid email." };
  if (f.get("agree") !== "yes") return { ok: false, error: "Please tick the box to confirm." };
  return { ok: true, pkg, name, email };
}
