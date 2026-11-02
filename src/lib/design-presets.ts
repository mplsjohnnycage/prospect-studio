// Hand-tuned design systems for demo sites. Each preset fixes the things models get wrong
// most often (type scale, spacing, palette, font pairing) and gives a clear layout
// signature, so the model spends its effort on layout and copy instead of guessing a style.
// Fonts are all on Google Fonts and none is on the banned list.

export type DesignPreset = {
  id: string;
  name: string;
  trades: RegExp;
  display: string; // Google Fonts family for headings
  body: string; // Google Fonts family for text
  fontsQuery: string; // css2 family query string
  tokens: { bg: string; surface: string; ink: string; muted: string; line: string; accent: string; accentInk: string; accent2: string; radius: string; dark?: boolean };
  signature: string; // what makes this look designed, not templated
  sections: string[]; // recommended order and treatment
  avoid: string;
};

export const PRESETS: DesignPreset[] = [
  {
    id: "editorial-craft", name: "Editorial Craft",
    trades: /paint|carpent|cabinet|remodel|interior|drywall|wallpaper|finish|trim|deck stain|refinish/i,
    display: "Fraunces", body: "Instrument Sans", fontsQuery: "family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,800&family=Instrument+Sans:wght@400;500;600",
    tokens: { bg: "#F6F1E9", surface: "#FFFDF9", ink: "#1C1A17", muted: "#6B6358", line: "#E4DACB", accent: "#B4532A", accentInk: "#FFFFFF", accent2: "#2F4A3A", radius: "4px" },
    signature: "Magazine layout: an oversized serif headline set tight (line-height 1.0, letter-spacing -0.02em) in an asymmetric 7/5 split hero with an inline-SVG composition of overlapping paint swatches or brush strokes in the palette; small-caps eyebrow labels; services as a numbered list (01, 02...) separated by hairline rules instead of cards; one full-bleed accent-colored band with a pull quote or promise.",
    sections: ["Sticky header: wordmark in the display font, anchor links, a solid accent 'Get a free quote' button", "Asymmetric hero with headline, one-sentence promise, primary CTA and a secondary text link", "Numbered services list with short specific descriptions", "Process in 4 steps on a horizontal timeline (stacks on mobile)", "Proof: verified rating/quote/trust signals in a large editorial pull-quote, or 'what to expect' if none", "Room/scope estimator or FAQ accordion", "Service area + contact + quote form side by side", "Footer with wordmark and anchor links"],
    avoid: "rounded pill buttons, drop-shadow cards everywhere, gradients on text",
  },
  {
    id: "bold-industrial", name: "Bold Industrial",
    trades: /roof|concrete|fenc|construct|excavat|asphalt|paving|gutter|siding|masonry|foundation|demolition|steel|weld/i,
    display: "Big Shoulders Display", body: "Archivo", fontsQuery: "family=Big+Shoulders+Display:wght@700;900&family=Archivo:wght@400;500;700",
    tokens: { bg: "#F4F4F2", surface: "#FFFFFF", ink: "#121416", muted: "#5A5F66", line: "#D9DADC", accent: "#F2B705", accentInk: "#121416", accent2: "#1D2329", radius: "2px" },
    signature: "Heavy, confident and structural: a dark (#1D2329) hero with huge uppercase condensed headline, a safety-yellow accent bar, and an inline-SVG roofline/blueprint line drawing; a stat strip with big numerals only for verified facts (otherwise use promises like 'Free on-site estimate'); angled section dividers using clip-path; checklists with bold square check icons.",
    sections: ["Header with a thin top utility bar (service area, hours if verified) and a yellow CTA", "Dark hero with headline, subline and two CTAs", "Services in a 2-column bordered grid with icon + title + 1 line", "Why us checklist on a light band with an angled divider", "Proof band (verified rating/quote/trust) or 'Our job-site promise'", "Project-scope estimator (tabs: repair / replace / inspection) with no prices", "Contact + quote form on dark background", "Footer"],
    avoid: "soft pastels, thin light fonts, playful illustrations",
  },
  {
    id: "clean-technical", name: "Clean Technical",
    trades: /hvac|heat|cool|air|furnace|electric|plumb|water heater|drain|boiler|solar|generator|insulation/i,
    display: "Space Grotesk", body: "IBM Plex Sans", fontsQuery: "family=Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;500;600",
    tokens: { bg: "#F5F8FB", surface: "#FFFFFF", ink: "#0B1B2B", muted: "#51606F", line: "#DCE4EC", accent: "#0A6CFF", accentInk: "#FFFFFF", accent2: "#FF6B35", radius: "10px" },
    signature: "Precise and reassuring: a clean hero with an inline-SVG schematic (ductwork, circuit or pipe diagram drawn with 1.5px strokes in the accent), an 'emergency or same-week service' callout in the warm secondary color if appropriate, a 'how it works' 3-step timeline with numbered nodes, and a diagnostic-style symptom picker that suggests the right service.",
    sections: ["Header with CTA and a compact call button if a phone is verified", "Hero with headline, short promise, CTA and schematic SVG", "Services as a tidy matrix (icon, name, 1 line) on white surface", "Symptom picker / estimator (buttons that reveal the likely service), no prices", "How it works timeline", "Proof or what-to-expect", "Service area + contact + form", "Footer"],
    avoid: "decorative serif fonts, heavy textures, dark muddy palettes",
  },
  {
    id: "organic-natural", name: "Organic Natural",
    trades: /landscap|lawn|tree|garden|yard|snow|irrigat|hardscap|mulch|sod|arbor/i,
    display: "DM Serif Display", body: "Manrope", fontsQuery: "family=DM+Serif+Display&family=Manrope:wght@400;500;700",
    tokens: { bg: "#F3F1E7", surface: "#FBFAF5", ink: "#1F2A1F", muted: "#5E6B5C", line: "#DDD8C6", accent: "#3F6B3A", accentInk: "#FFFFFF", accent2: "#C8A96A", radius: "18px" },
    signature: "Warm and grounded: soft organic blob shapes and leaf line-art in inline SVG behind the hero headline, seasonal services in tabs (Spring / Summer / Fall / Winter), large rounded image-free panels using layered greens, and a gentle wave divider between sections.",
    sections: ["Header with CTA", "Hero with organic SVG composition", "Seasonal services tabs", "Why us / care promise in a split layout", "Proof or what-to-expect", "Yard size estimator (small / medium / large + services checklist), no prices", "Service area + contact + form", "Footer"],
    avoid: "hard industrial angles, neon colors",
  },
  {
    id: "fresh-minimal", name: "Fresh Minimal",
    trades: /clean|maid|janitor|pressure|power wash|window|carpet|pool|pest|mold/i,
    display: "Outfit", body: "Figtree", fontsQuery: "family=Outfit:wght@500;700&family=Figtree:wght@400;500;600",
    tokens: { bg: "#FFFFFF", surface: "#F2F7F7", ink: "#10201F", muted: "#4E6261", line: "#DDE9E8", accent: "#0F766E", accentInk: "#FFFFFF", accent2: "#FFD166", radius: "14px" },
    signature: "Airy and spotless: lots of white space, a subtle sparkle/bubble SVG motif, a CSS-only before/after comparison slider built with an input range and two layered panels of pattern/gradient (no photos), checklists of what's included per service, and a friendly booking-style quote form.",
    sections: ["Header with CTA", "Hero with promise and sparkle SVG", "Services with 'what's included' checklists", "Before/after slider demo", "How booking works in 3 steps", "Proof or what-to-expect", "Contact + quote form", "Footer"],
    avoid: "dark heavy backgrounds, dense paragraphs",
  },
  {
    id: "heritage-trust", name: "Heritage Trust",
    trades: /handyman|general contractor|home repair|restoration|window install|door|garage|locksmith|appliance|chimney|septic|well/i,
    display: "Libre Caslon Display", body: "Source Sans 3", fontsQuery: "family=Libre+Caslon+Display&family=Source+Sans+3:wght@400;600;700",
    tokens: { bg: "#FBF8F3", surface: "#FFFFFF", ink: "#1E2430", muted: "#5B6170", line: "#E6E0D5", accent: "#1F4E79", accentInk: "#FFFFFF", accent2: "#C9A227", radius: "6px" },
    signature: "Classic and trustworthy: centered hero with a refined serif headline and brass hairline ornaments, badge-style trust seals drawn in SVG (only for verified trust signals; otherwise generic promises like 'Free estimates' and 'Clean job site'), an inline-SVG neighborhood map sketch for the service area, and an FAQ accordion.",
    sections: ["Header", "Centered hero", "Services in a two-column list with icons", "Promises / trust seals", "Proof or what-to-expect", "Service area map sketch", "FAQ accordion", "Contact + form", "Footer"],
    avoid: "trendy neon, glassmorphism",
  },
  {
    id: "night-signature", name: "Night Signature",
    trades: /luxury|custom home|kitchen|bath|design build|architect|high[- ]end|epoxy|glass/i,
    display: "Cormorant Garamond", body: "Work Sans", fontsQuery: "family=Cormorant+Garamond:wght@500;600;700&family=Work+Sans:wght@400;500;600",
    tokens: { bg: "#111111", surface: "#1A1A1A", ink: "#F5F2EA", muted: "#B5AFA3", line: "#2C2A27", accent: "#D4A373", accentInk: "#111111", accent2: "#8A9A5B", radius: "0px", dark: true },
    signature: "Premium and cinematic: full-bleed dark hero with a very large light serif headline, gold hairline rules, generous negative space, an abstract architectural line drawing in SVG, and a 'project story' section told in three acts (before, during, after) without photos.",
    sections: ["Minimal header with gold CTA", "Cinematic hero", "Services as elegant columns", "Project story in three acts", "Proof or what-to-expect", "Consultation request form with project type tabs", "Contact", "Footer"],
    avoid: "bright saturated colors, chunky rounded UI",
  },
  {
    id: "bright-local", name: "Bright Local",
    trades: /junk|moving|haul|mov|appliance repair|auto|mobile|detail|towing|dog|pet|bike/i,
    display: "Bricolage Grotesque", body: "Nunito Sans", fontsQuery: "family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Nunito+Sans:wght@400;600;700",
    tokens: { bg: "#FFFDF7", surface: "#FFFFFF", ink: "#1B1B1B", muted: "#5C5C5C", line: "#EDE6D6", accent: "#FF5A1F", accentInk: "#1B1B1B", accent2: "#2B59C3", radius: "16px" },
    signature: "Energetic and friendly: chunky rounded buttons with a 2px ink border and offset shadow, playful inline-SVG illustration in the hero, sticker-like labels, a quick 'what do you need?' picker that pre-fills the quote form.",
    sections: ["Header with CTA", "Playful hero", "Service picker that pre-fills the form", "How it works", "Proof or what-to-expect", "Service area", "Contact + form", "Footer"],
    avoid: "corporate gray, thin fonts",
  },
];

const hex = (s: string) => /^#[0-9a-f]{6}$/i.test(s) ? s : null;
function rgb(h: string): [number, number, number] { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number]; }
function luminance(h: string): number { return rgb(h).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0); }
export function contrast(a: string, b: string): number { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); }
function saturation(h: string): number { const [r, g, b] = rgb(h); const max = Math.max(r, g, b), min = Math.min(r, g, b); return max === 0 ? 0 : (max - min) / max; }

/** The most brand-like color from a scraped palette: saturated, not near white or black. */
export function brandAccent(palette: string[]): string | null {
  const c = palette.map(hex).filter((h): h is string => !!h).filter(h => saturation(h) > 0.35 && luminance(h) > 0.03 && luminance(h) < 0.8);
  return c.sort((a, b) => saturation(b) - saturation(a))[0] ?? null;
}

export function pickPreset(trade: string, direction = ""): DesignPreset {
  if (/signature/i.test(direction) && /remodel|kitchen|bath|custom/i.test(trade)) return PRESETS.find(p => p.id === "night-signature")!;
  return PRESETS.find(p => p.trades.test(trade)) ?? PRESETS.find(p => p.id === "heritage-trust")!;
}

/** Preset tokens with the business's own brand color swapped in when we found one. */
export function presetTokens(p: DesignPreset, palette: string[]): DesignPreset["tokens"] & { brandColorUsed: boolean } {
  const brand = brandAccent(palette);
  if (!brand) return { ...p.tokens, brandColorUsed: false };
  // Keep the brand color only if it can carry text on the page background or as a button.
  const ok = contrast(brand, p.tokens.bg) >= 3;
  if (!ok) return { ...p.tokens, brandColorUsed: false };
  const accentInk = contrast(brand, "#FFFFFF") >= 4.5 ? "#FFFFFF" : "#111111";
  return { ...p.tokens, accent: brand, accentInk, brandColorUsed: true };
}

export function tokenCss(p: DesignPreset, t: DesignPreset["tokens"]): string {
  return `:root{--bg:${t.bg};--surface:${t.surface};--ink:${t.ink};--muted:${t.muted};--line:${t.line};--accent:${t.accent};--accent-ink:${t.accentInk};--accent-2:${t.accent2};--radius:${t.radius};--font-display:'${p.display}',Georgia,serif;--font-body:'${p.body}',sans-serif;--step--1:clamp(.83rem,.8rem + .15vw,.92rem);--step-0:clamp(1rem,.96rem + .2vw,1.125rem);--step-1:clamp(1.25rem,1.15rem + .5vw,1.5rem);--step-2:clamp(1.56rem,1.35rem + 1vw,2.1rem);--step-3:clamp(1.95rem,1.6rem + 1.8vw,3rem);--step-4:clamp(2.6rem,1.8rem + 3.6vw,4.8rem);--space-1:.5rem;--space-2:1rem;--space-3:1.5rem;--space-4:2.5rem;--space-5:4rem;--space-6:6.5rem;--max:1180px;--shadow:0 1px 2px rgb(0 0 0/.06),0 10px 30px rgb(0 0 0/.08)}
*,*::before,*::after{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font:400 var(--step-0)/1.6 var(--font-body);-webkit-font-smoothing:antialiased}h1,h2,h3{font-family:var(--font-display);line-height:1.05;letter-spacing:-.015em;margin:0 0 var(--space-2)}p{max-width:65ch}a{color:inherit}:focus-visible{outline:3px solid var(--accent);outline-offset:3px}.wrap{width:min(100% - 2.5rem,var(--max));margin-inline:auto}`;
}

export function fontsHref(p: DesignPreset): string {
  return `https://fonts.googleapis.com/css2?${p.fontsQuery}&display=swap`;
}

/** The design-system block given to the model. */
export function presetBrief(p: DesignPreset, palette: string[]): string {
  const t = presetTokens(p, palette);
  return [
    `Design system: "${p.name}". Use it exactly; do not swap fonts or invent a different palette.`,
    `Fonts: load ${p.display} (headings) and ${p.body} (text) with this stylesheet, plus preconnects to https://fonts.googleapis.com and https://fonts.gstatic.com:`,
    fontsHref(p),
    `Start your <style> with this block verbatim, then build on these variables everywhere (no stray hex colors except tints made with color-mix or rgba of these):`,
    tokenCss(p, t),
    t.brandColorUsed ? `The accent (${t.accent}) is the business's own brand color found on their site.` : "",
    `Look and feel: ${p.signature}`,
    `Section plan (adapt to the facts; keep at least 6 sections):\n${p.sections.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    `Avoid: ${p.avoid}.`,
  ].filter(Boolean).join("\n");
}
