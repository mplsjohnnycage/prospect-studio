// Custom sandbox-agent provider: Docker hosted cloud sandboxes. DESIGN STUB, NOT RUN (zero spend).
// Interface from sandbox-agent 0.5.5 dist/types (SandboxProvider: name, create, destroy, pause?, getUrl/getFetch).
// The @docker/sandboxes calls below follow docs.docker.com/ai/sandboxes-api; exact method names UNVERIFIED.
import type { SandboxProvider } from "sandbox-agent";

export function dockerCloud(opts: { size?: "micro" | "small"; allow?: string[]; expiryMinutes?: number } = {}): SandboxProvider {
  const guard = () => {
    if (process.env.DOCKER_CLOUD_ENABLED !== "1") throw new Error("docker-cloud disabled: needs Johnny's go (billed per second)");
  };
  return {
    name: "docker-cloud",
    async create() {
      guard();
      // TODO(after subscription): const { Sandboxes, pat } = await import("@docker/sandboxes");
      // const sb = await new Sandboxes({ auth: pat(process.env.DOCKER_ID, process.env.DOCKER_PAT) })
      //   .create({ resources: opts.size ?? "micro", network: { allow: opts.allow }, expiresIn: opts.expiryMinutes ?? 20 });
      // await sb.exec("curl -fsSL https://releases.rivet.dev/sandbox-agent/0.5.x/install.sh | sh && sandbox-agent server --host 0.0.0.0 --port 3000 &");
      // return sb.id;
      throw new Error("docker-cloud create(): not implemented until subscription is active");
    },
    async destroy(_id: string) { guard(); throw new Error("not implemented"); },
    // getUrl/getFetch: tunnel to sandbox port 3000 via @docker/sandboxes port publishing (UNVERIFIED).
  } as SandboxProvider;
}
