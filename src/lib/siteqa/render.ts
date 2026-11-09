/** Native-static preview render from Design IR (Loop-1 build path). */

import type { DesignIr, DesignNode } from "../design/ir.ts";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function renderNode(node: DesignNode): string {
  switch (node.type) {
    case "page":
      return node.children.map(renderNode).join("\n");
    case "hero": {
      const headline = esc(String(node.props.headline ?? ""));
      const cta = esc(String(node.props.ctaLabel ?? "Learn more"));
      return `<section class="hero" aria-label="Hero"><h1>${headline}</h1><a class="btn" href="#contact">${cta}</a></section>`;
    }
    case "services": {
      const items = Array.isArray(node.props.items)
        ? (node.props.items as unknown[]).map(String)
        : [];
      const cards = items
        .map((item) => `<article class="card"><h2>${esc(item)}</h2></article>`)
        .join("");
      return `<section class="services" aria-label="Services"><div class="grid">${cards}</div></section>`;
    }
    case "cta": {
      const label = esc(String(node.props.label ?? "Contact"));
      return `<section id="contact" class="cta" aria-label="Contact"><button type="button">${label}</button></section>`;
    }
    default:
      return `<!-- skipped ${esc(node.type)} -->`;
  }
}

export function renderDesignIrHtml(ir: DesignIr): string {
  const business = esc(String(ir.root.props.businessName ?? ir.title));
  const body = renderNode(ir.root);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(ir.title)} · ${business}</title>
<style>
:root{--ink:#1c1917;--paper:#fafaf9;--accent:#0f766e;--soft:#e7e5e4}
*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,sans-serif;background:var(--paper);color:var(--ink)}
header,main,footer{max-width:960px;margin:0 auto;padding:1rem 1.25rem}
header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--soft)}
.brand{font-weight:700;letter-spacing:-.02em}.hero{padding:3rem 0}.hero h1{font-size:clamp(2rem,5vw,3.4rem);line-height:1.1;margin:0 0 1rem}
.btn,button{display:inline-flex;align-items:center;gap:.4rem;background:var(--accent);color:#fff;border:0;border-radius:.6rem;padding:.75rem 1rem;font-weight:650;text-decoration:none;cursor:pointer}
.services{padding:2rem 0}.grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
.card{border:1px solid var(--soft);border-radius:1rem;padding:1rem;background:#fff}.cta{padding:2rem 0 3rem}
footer{border-top:1px solid var(--soft);font-size:.85rem;opacity:.75}
.banner{background:var(--ink);color:var(--paper);text-align:center;font-size:.75rem;padding:.5rem}
@media (max-width:640px){.hero{padding:2rem 0}.hero h1{font-size:2rem}}
</style>
</head>
<body>
<div class="banner">Private preview · Design IR ${esc(ir.version)} r${ir.revision} · Not a published site</div>
<header><div class="brand">${business}</div><nav aria-label="Primary"><a href="#contact">Contact</a></nav></header>
<main>
${body}
</main>
<footer>Prospect Studio preview for revision ${ir.revision}</footer>
</body>
</html>`;
}

export type QaChecklist = {
  version: "qa.v1";
  hasLang: boolean;
  hasViewport: boolean;
  hasMain: boolean;
  hasH1: boolean;
  responsiveHint: boolean;
  ok: boolean;
  notes: string[];
};

export function qaHtml(html: string): QaChecklist {
  const hasLang = /<html[^>]*lang=/i.test(html);
  const hasViewport = /name="viewport"/i.test(html);
  const hasMain = /<main[\s>]/i.test(html);
  const hasH1 = /<h1[\s>]/i.test(html);
  const responsiveHint = /@media\s*\(max-width/i.test(html);
  const notes: string[] = [];
  if (!hasLang) notes.push("Missing html lang");
  if (!hasViewport) notes.push("Missing viewport meta");
  if (!hasMain) notes.push("Missing main landmark");
  if (!hasH1) notes.push("Missing h1");
  if (!responsiveHint) notes.push("Missing responsive media query");
  return {
    version: "qa.v1",
    hasLang,
    hasViewport,
    hasMain,
    hasH1,
    responsiveHint,
    ok: notes.length === 0,
    notes,
  };
}
