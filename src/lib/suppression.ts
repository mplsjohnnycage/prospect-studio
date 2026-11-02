// Do-not-contact matching. Pure and offline-testable; storage lives in convex/suppressions.ts.
export type SuppressionKind = "email" | "domain";
export type Suppression = { kind: SuppressionKind; value: string };

const LOCAL_RE = /^[a-z0-9._%+-]+$/;
const HOST_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;

/** Turn user input (an email, a domain, or a URL) into a canonical suppression entry, or null if unusable. */
export function normalizeSuppression(input: string): Suppression | null {
  const s = input.trim().toLowerCase().replace(/^mailto:/, "");
  if (!s || s.length > 254) return null;
  if (s.includes("@")) {
    const parts = s.split("@");
    if (parts.length !== 2) return null;
    const [local, domain] = parts;
    if (!local || !LOCAL_RE.test(local) || !domain || !HOST_RE.test(domain)) return null;
    return { kind: "email", value: `${local}@${domain}` };
  }
  let host: string;
  try {
    host = new URL(s.includes("://") ? s : "https://" + s).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "");
  return HOST_RE.test(host) ? { kind: "domain", value: host } : null;
}

function hostOf(value: string): string | null {
  const n = normalizeSuppression(value);
  if (!n) return null;
  return n.kind === "domain" ? n.value : n.value.split("@")[1];
}

/** First matching entry for a prospect's contact and website, or null. A domain entry also covers its subdomains. */
export function isSuppressed(target: { contact?: string; website?: string }, entries: Suppression[]): Suppression | null {
  const emails: string[] = [];
  const hosts: string[] = [];
  for (const part of (target.contact ?? "").split(/[\s,;]+/)) {
    if (!part) continue;
    const n = normalizeSuppression(part);
    if (n?.kind === "email") {
      emails.push(n.value);
      const h = hostOf(n.value);
      if (h) hosts.push(h);
    }
  }
  if (target.website) {
    const h = hostOf(target.website);
    if (h) hosts.push(h);
  }
  for (const e of entries) {
    if (e.kind === "email" && emails.includes(e.value)) return e;
    if (e.kind === "domain" && hosts.some(h => h === e.value || h.endsWith("." + e.value))) return e;
  }
  return null;
}
