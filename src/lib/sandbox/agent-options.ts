// Prospect Studio sandbox agent options: single source of truth (2026-11-03).
// Status: "verified" = CLI ran `--version` free on the box 2026-11-03 and is on a documented
// Docker Sandboxes / Rivet sandbox-agent list. Nothing here has been signed in or run on a task.
// Env var NAMES only. Subscription / OAuth sign-in is preferred; API keys are fallback only.
export type AgentId = "claude-code" | "codex" | "opencode" | "pi" | "grok" | "cursor-sdk" | "cli";
export type Status = "verified" | "unverified" | "blocked";
export interface AgentOption {
  id: AgentId; label: string; npm?: string; versionSeen?: string;
  launch: string; headless: string; smoke: string;
  auth: { mode: "subscription-oauth" | "api-key" | "none"; signIn?: string; fallbackEnv?: string[] };
  mcp: boolean | "unknown"; role?: "primary" | "secondary";
  dockerSandboxes: boolean; rivetSandboxAgent: boolean; status: Status; notes: string;
}
export const AGENT_OPTIONS: Record<AgentId, AgentOption> = {
  "claude-code": { id: "claude-code", label: "Claude Code", npm: "@anthropic-ai/claude-code", versionSeen: "2.1.317",
    launch: "sbx run claude", headless: "claude -p --output-format stream-json", smoke: "claude --version",
    auth: { mode: "subscription-oauth", signIn: "claude /login (Claude plan)", fallbackEnv: ["ANTHROPIC_API_KEY"] },
    mcp: true, dockerSandboxes: true, rivetSandboxAgent: true, status: "verified", notes: "CLI runs; sign-in untested." },
  codex: { id: "codex", label: "Codex", npm: "@openai/codex", versionSeen: "0.166.0",
    launch: "sbx run codex", headless: "codex exec --json", smoke: "codex --version",
    auth: { mode: "subscription-oauth", signIn: "codex login (Sign in with ChatGPT)", fallbackEnv: ["OPENAI_API_KEY"] },
    mcp: true, role: "primary", dockerSandboxes: true, rivetSandboxAgent: true, status: "verified", notes: "ChatGPT sign-in needs Johnny's browser; untested." },
  opencode: { id: "opencode", label: "OpenCode", npm: "opencode-ai", versionSeen: "1.19.5",
    launch: "sbx run opencode", headless: "opencode run --format json", smoke: "opencode --version",
    auth: { mode: "subscription-oauth", signIn: "opencode auth login" }, mcp: true, role: "secondary",
    dockerSandboxes: true, rivetSandboxAgent: true, status: "verified", notes: "Second model per Johnny." },
  pi: { id: "pi", label: "Pi (Pi Durable)", npm: "@earendil-works/pi-coding-agent", versionSeen: "1.5.0",
    launch: "sbx run shell -- pi  |  Rivet actor @rivet-dev/pi 0.5.5", headless: "pi -p --mode json", smoke: "pi --version",
    auth: { mode: "subscription-oauth", signIn: "pi /login (ChatGPT; @rivet-dev/pi oauth credentials)" }, mcp: true, role: "primary",
    dockerSandboxes: false, rivetSandboxAgent: true, status: "verified", notes: "Primary harness. Not a native Docker Sandboxes agent: runs via the Shell sandbox. CLI runs; sign-in untested." },
  grok: { id: "grok", label: "Grok CLI", npm: "@vibe-kit/grok-cli", versionSeen: "1.0.1",
    launch: "sbx run shell -- grok", headless: "grok -p", smoke: "grok --version",
    auth: { mode: "api-key", fallbackEnv: ["GROK_API_KEY"] }, mcp: "unknown",
    dockerSandboxes: false, rivetSandboxAgent: false, status: "unverified",
    notes: "Community CLI, not on either supported list; no subscription sign-in found; any use needs an xAI key = spend -> needs Johnny's go." },
  "cursor-sdk": { id: "cursor-sdk", label: "Cursor (SDK / cursor-agent)", npm: "@cursor/sdk", versionSeen: "1.3.0",
    launch: "sbx run cursor", headless: "cursor-agent -p --output-format stream-json", smoke: "cursor-agent --version",
    auth: { mode: "subscription-oauth", signIn: "cursor-agent login", fallbackEnv: ["CURSOR_API_KEY"] }, mcp: true,
    dockerSandboxes: true, rivetSandboxAgent: true, status: "unverified", notes: "Package exists on npm; local import/--version smoke did not complete." },
  cli: { id: "cli", label: "Plain CLI (shell)", launch: "sbx run shell", headless: "sh -c <cmd>", smoke: "sh -c 'echo ok'",
    auth: { mode: "none" }, mcp: false, dockerSandboxes: true, rivetSandboxAgent: false, status: "verified", notes: "Agent-less sandbox; Tier 2 default." },
};
