// Full-agentic loop core: pure, testable policy. Convex code (convex/agent.ts) enforces it server-side.
import {composeWhyNow, triggerAgeDays, type Trigger, type Gates, type OutcomeEvent} from "./revenue-engine";

export const STAGES = ["sense", "qualify", "build", "reach", "learn"] as const;
export type AgentStage = typeof STAGES[number];
export type Level = 0 | 1 | 2 | 3; // L0 suggest, L1 draft, L2 auto-build demos, L3 auto-queue drafts for approval
export type AgentConfig = { paused: boolean; levels: Record<AgentStage, Level>; caps: { demosPerDay: number; draftsPerDay: number; promotesPerDay: number; fetchesPerHost: number }; allowlist: string[]; evalsPassed: Partial<Record<AgentStage, number>> };
export const DEFAULT_CONFIG: AgentConfig = {
  paused: true, // kill switch ON until Johnny enables the loop
  levels: { sense: 1, qualify: 1, build: 1, reach: 1, learn: 1 },
  caps: { demosPerDay: 10, draftsPerDay: 40, promotesPerDay: 200, fetchesPerHost: 30 },
  allowlist: [], evalsPassed: {},
};
export const TASK_KINDS = ["sense", "qualify", "build", "reach", "learn", "digest", "recheck", "reviews"] as const;
export type TaskKind = typeof TASK_KINDS[number];
export const TASK_STATUSES = ["queued", "claimed", "done", "failed", "parked"] as const;
/** Start of the current calendar day in America/Chicago (daily caps reset at local midnight). */
export function chicagoDayStart(now: number): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now)).map(p => [p.type, p.value]));
  const sinceMidnight = ((+parts.hour * 60 + +parts.minute) * 60 + +parts.second) * 1000 + (now % 1000);
  return now - sinceMidnight;
}
/** Same alert text inside the window is not logged again. */
export const ALERT_DEDUPE_MS = 6 * 3600_000;
export const KIND_STAGE: Record<TaskKind, AgentStage> = { sense: "sense", qualify: "qualify", build: "build", reach: "reach", learn: "learn", digest: "learn", recheck: "qualify", reviews: "qualify" };
/** Actions the agent may never take at any level. Enforced by having no code path, and asserted here. */
export const NEVER_AUTONOMOUS = ["send_email", "send_reply", "set_price", "accept_proposal", "spend"] as const;

export type Decision = { allow: boolean; reason: string };
export function mayRun(cfg: AgentConfig, kind: TaskKind, used: { demos: number; drafts: number; promotes: number }): Decision {
  if (cfg.paused) return { allow: false, reason: "kill switch on (loop paused)" };
  const stage = KIND_STAGE[kind], lvl = cfg.levels[stage];
  if (lvl === 0) return { allow: false, reason: stage + " at L0 (suggest only)" };
  if (kind === "build") {
    if (lvl < 2) return { allow: false, reason: "build at L1: demos are built only on Johnny's request" };
    if (used.demos >= cfg.caps.demosPerDay) return { allow: false, reason: "daily demo cap reached" };
  }
  if (kind === "reach" && used.drafts >= cfg.caps.draftsPerDay) return { allow: false, reason: "daily draft cap reached" };
  if (kind === "sense" && used.promotes >= cfg.caps.promotesPerDay) return { allow: false, reason: "daily promote cap reached" };
  return { allow: true, reason: "ok" };
}
/** A level above L1 can only be set once that stage's eval passed. Sends/prices are never a level. */
export function setLevel(cfg: AgentConfig, stage: AgentStage, level: Level): AgentConfig {
  if (level >= 2 && !(cfg.evalsPassed[stage] ?? 0)) throw Error(stage + " eval has not passed; cannot raise above L1");
  return { ...cfg, levels: { ...cfg.levels, [stage]: level } };
}
/** Only the in-Convex builtin worker is trusted by name. Desktop, Sprite and outside agents must be registered (allowlisted) by Johnny. */
export function mayClaim(cfg: AgentConfig, worker: string): boolean { return worker === "builtin" || cfg.allowlist.includes(worker); }

// ---------- Tasks: lease, retry, idempotency ----------
export type AgentTask = { key: string; kind: TaskKind; status: "queued" | "claimed" | "done" | "failed" | "parked"; attempts: number; leaseUntil?: number; notBefore?: number; claimedBy?: string };
/** Tailscale worker plan: 3 attempts, then needs review (parked). */
export const MAX_ATTEMPTS = 3;
export function taskKey(kind: TaskKind, prospectId: string, input: unknown): string {
  const s = JSON.stringify(input ?? null); let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return kind + ":" + prospectId + ":" + h.toString(36);
}
export function backoffMs(attempts: number): number { return Math.min(6 * 3_600_000, 60_000 * 2 ** Math.max(0, attempts - 1)); }
export function claimableTask(t: AgentTask, now: number): boolean { return (t.status === "queued" && (t.notBefore ?? 0) <= now) || (t.status === "claimed" && (t.leaseUntil ?? 0) < now); }
export function onFailure(t: AgentTask, now: number): AgentTask { const attempts = t.attempts; return attempts >= MAX_ATTEMPTS ? { ...t, status: "parked", leaseUntil: undefined } : { ...t, status: "queued", leaseUntil: undefined, notBefore: now + backoffMs(attempts) }; }
/** External workers: 90 s lease renewed every 20 s (LEASE_RENEW_MS). The builtin runs inside one Convex action, so it gets 10 min. */
export const LEASE_TTL_MS = 90_000;
export const LEASE_RENEW_MS = 20_000;
export const WORKER_HEARTBEAT_MS = 30_000;
export function leaseFor(worker: string): number { return worker === "builtin" ? 10 * 60_000 : LEASE_TTL_MS; }
/** Tier: free Convex action unless the task needs a browser/local model (desktop) or heavy build (sprite). */
export function tierFor(kind: TaskKind, needs: { browser?: boolean; heavy?: boolean } = {}): "convex" | "desktop" | "sprite" { return needs.heavy ? "sprite" : needs.browser || kind === "recheck" && needs.browser ? "desktop" : "convex"; }

// ---------- Alerts ----------
export type RunRow = { status: "ok" | "error" | "skipped"; usd: number; kind: string; error?: string };
export function alertsFor(runs: RunRow[], qaFailures = 0): string[] {
  const out: string[] = [];
  const last3 = runs.slice(-3);
  if (last3.length === 3 && last3.every(r => r.status === "error")) out.push("3 consecutive task failures: " + (last3[2].error ?? "").slice(0, 120));
  if (runs.some(r => r.usd > 0)) out.push("Non-zero spend recorded; loop should be paused");
  if (qaFailures >= 3) out.push(qaFailures + " demo QA failures today");
  return out;
}

// ---------- Evals (gate before raising a level) ----------
export type EvalResult = { stage: AgentStage; level: Level; n: number; score: number; threshold: number; pass: boolean; notes: string[] };
export function evalQualify(items: { identityKey: string; sourceUrl: string; trigger: Trigger; gatesPassed: boolean }[]): EvalResult {
  const keys = new Set<string>(); let good = 0; const notes: string[] = [];
  for (const i of items) { const ok = !!i.sourceUrl && !keys.has(i.identityKey) && (i.trigger.type === "none" || !!i.trigger.source); keys.add(i.identityKey); if (ok) good++; else notes.push("bad: " + i.identityKey); }
  const score = items.length ? good / items.length : 0;
  return { stage: "qualify", level: 1, n: items.length, score, threshold: 0.9, pass: items.length >= 50 && score >= 0.9, notes: notes.slice(0, 5) };
}
export function evalBuild(demos: { qaPass: boolean; unsourced: number }[]): EvalResult {
  const good = demos.filter(d => d.qaPass && d.unsourced === 0).length; const score = demos.length ? good / demos.length : 0;
  return { stage: "build", level: 2, n: demos.length, score, threshold: 1, pass: demos.length >= 20 && score === 1, notes: ["Human 4/5 rating still required from Johnny"] };
}
export function evalReach(drafts: { issues: string[] }[]): EvalResult {
  const good = drafts.filter(d => !d.issues.length).length; const score = drafts.length ? good / drafts.length : 0;
  return { stage: "reach", level: 3, n: drafts.length, score, threshold: 1, pass: drafts.length >= 30 && score === 1, notes: ["'Would send' rate needs Johnny's review"] };
}

// ---------- Feature: 30-second call script card ----------
export function callScript(p: { name: string; trade: string; city: string; trigger: Trigger; gap: string[]; views?: number; demoUrl?: string }): string[] {
  const age = triggerAgeDays(p.trigger);
  return [
    `Open: "Hi, this is Johnny with Found It. Fix It. Is this ${p.name}?"`,
    p.trigger.type !== "none" ? `Why now: ${p.trigger.type.replace(/_/g, " ")}${p.trigger.date ? " on " + p.trigger.date : ""}${age !== undefined ? " (" + age + " days ago)" : ""}.` : `Why now: local ${p.trade} in ${p.city}.`,
    `Found it: ${(p.gap[0] ?? "no site that turns visitors into quote requests").replace(/^Gap:\s*/, "")}.`,
    p.views ? `They opened the demo ${p.views}x. Ask: "What did you think of the demo?"` : `Offer: "I built you a private demo. Can I text you the link?"`,
    `Close: "If you like it, it's yours, live in hours. Want 15 minutes this week?" (Price: Johnny quotes.)`,
  ];
}

// ---------- Feature: 'your site vs competitor' teardown ----------
export type SiteFacts = { name: string; url?: string; https?: boolean; mobile?: boolean; quoteForm?: boolean; reviewsShown?: boolean; loadMs?: number };
export function teardown(you: SiteFacts, rival: SiteFacts): { lines: string[]; score: { you: number; rival: number } } {
  const checks: [string, (s: SiteFacts) => boolean][] = [["Has a website", s => !!s.url], ["Secure (https)", s => !!s.https], ["Works on phones", s => !!s.mobile], ["Online quote/booking", s => !!s.quoteForm], ["Shows reviews", s => !!s.reviewsShown], ["Loads under 3s", s => (s.loadMs ?? 99999) < 3000]];
  const mark = (b: boolean) => (b ? "yes" : "no");
  const lines = checks.map(([label, f]) => `${label}: ${you.name} ${mark(f(you))} · ${rival.name} ${mark(f(rival))}`);
  return { lines, score: { you: checks.filter(([, f]) => f(you)).length, rival: checks.filter(([, f]) => f(rival)).length } };
}

/** Map an automated site check onto teardown facts (each "no" is backed by a check issue, never guessed). */
export function siteFactsFrom(name: string, h: { state: string; issues: string[] }): SiteFacts {
  const has = (re: RegExp) => h.issues.some(i => re.test(i));
  const live = h.state !== "none" && h.state !== "dead";
  return { name, url: live ? "yes" : undefined, https: live && !has(/https|ssl|secure/i), mobile: live && !has(/mobile|viewport|phone/i), quoteForm: live && !has(/form|quote|booking|contact/i), reviewsShown: live && !has(/review/i), loadMs: live ? (has(/slow|load|speed/i) ? 5000 : 1000) : undefined };
}

// ---------- Feature: test lead capture (forwards a labeled TEST lead, never a real customer) ----------
export function testLead(business: string): { name: string; phone: string; email: string; message: string; test: true } {
  return { name: "TEST LEAD (demo)", phone: "(555) 010-0000", email: "test-lead@example.com", message: `This is a test lead from your ${business} DEMO, showing how requests reach you.`, test: true };
}

// ---------- Feature: pay-to-live plan ----------
export function payToLivePlan(p: { name: string; domain?: string }): { step: string; auto: boolean; note: string }[] {
  return [
    { step: "paid", auto: false, note: "Johnny confirms payment" },
    { step: "repo_created", auto: true, note: "Copy approved demo into a repo in the buyer's name" },
    { step: "domain_connected", auto: false, note: p.domain ? "Point " + p.domain + " (buyer's DNS)" : "Buyer picks a domain; Johnny approves any purchase" },
    { step: "backend_live", auto: true, note: "Forms/booking wired to buyer's inbox" },
    { step: "site_live", auto: true, note: "Remove DEMO banner + noindex only on the buyer's own domain" },
  ];
}

// ---------- Feature: weekly outcome report that proposes new gate weights ----------
export function weeklyReport(events: OutcomeEvent[], weights: number[], prior: number[], labels: number): string {
  const c = (k: string) => new Set(events.filter(e => e.kind === k).map(e => e.prospectId)).size;
  const names = ["fit", "gap", "spend", "care", "timing"];
  const changes = names.map((n, i) => `${n} ${prior[i]} -> ${weights[i]}`).join(", ");
  return [`Weekly outcomes: sent ${c("sent")}, viewed ${c("viewed")}, replied ${c("replied")}, calls ${c("call_booked")}, paid ${c("paid")}.`,
    labels >= 200 ? `Proposed gate weights (${labels} labels): ${changes}. Apply in Settings.` : `Gate weights unchanged: ${labels} labels so far, need 200.`].join("\n");
}

// ---------- Daily digest (draft only) ----------
export function digest(d: { promoted: number; built: number; drafted: number; failures: number; alerts: string[]; paused: boolean }): { subject: string; body: string } {
  return { subject: "Prospect loop: daily digest", body: [`${d.paused ? "Loop paused (kill switch on)." : "Loop running."} Promoted ${d.promoted}, demos ${d.built}, drafts waiting ${d.drafted}.`, d.failures ? `${d.failures} task failures.` : "No failures.", d.alerts.length ? "Alerts: " + d.alerts.join("; ") : "No alerts."].join("\n") };
}
export { composeWhyNow, type Gates };

// ---------- Desktop-primary tiering (Johnny: runtime lives on DESKTOP-3APDBKG) ----------
/** A worker is online if its heartbeat is under 75 s old (Tailscale plan). */
export const DESKTOP_HEARTBEAT_MS = 75_000;
/** Desktop is Tier 1. A Sprite/sandbox worker may claim only when no desktop heartbeat is fresh. */
export function fallbackAllowed(worker: string, lastDesktopSeen: number | undefined, now: number): boolean {
  if (!worker.startsWith("sprite:")) return true;
  return !lastDesktopSeen || now - lastDesktopSeen > DESKTOP_HEARTBEAT_MS;
}
