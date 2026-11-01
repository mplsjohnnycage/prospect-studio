import { createRegistry } from "@earendil-works/pi-durable";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import { pi } from "@rivet-dev/pi";
import { agentOSProvider } from "@rivet-dev/sandbox-adapter/agentos";

/**
 * Durable generation worker: one Pi Durable Rivet Actor per prospect.
 *
 * Pi stores conversations, model/tool steps and tasks in its Actor SQLite.
 * agentOS is the separate, durable sandbox for filesystem and shell execution.
 * Never connect arbitrary browser input directly to this agent; authorize the
 * caller against the prospect owner in Convex before issuing a prompt.
 *
 * Publishing and outreach must go through explicit approvals, not shell tools.
 * The UI deliberately does not expose this worker until credentials, scoped
 * authorization and review gates are installed and tested.
 */
const extensions = createRegistry();
extensions.install(CodingTools);

export const durableDesignAgent = pi({
  model: process.env.PI_DURABLE_MODEL || "anthropic/claude-sonnet-4-5",
  registry: extensions,
  sandbox: agentOSProvider(),
  actions: {
    readiness: async () => ({
      configured: !!(process.env.ANTHROPIC_API_KEY ||
        process.env.OPENAI_API_KEY ||
        process.env.GEMINI_API_KEY ||
        process.env.OPENROUTER_API_KEY),
      actorPersistence: "rivet-sqlite",
      sandboxProvider: "agentos",
      externalPublish: "disabled",
      emailSending: "disabled",
    }),
  },
});
