// Calls the same registry.handler the Vercel route uses, in-process, and prints status codes only.
//   RIVET_ENDPOINT=https://<ns>:<token>@api.rivet.dev node --import tsx scripts/rivet-handler-smoke.mts
import {registry} from "../src/lib/rivet";
import {rivetRouteEnabled} from "../src/lib/rivet-route";

const ep = process.env.RIVET_ENDPOINT;
console.log("route enabled:", rivetRouteEnabled(ep));
for (const path of ["/api/rivet/metadata", "/api/rivet/health", "/api/rivet/start"]) {
  try {
    const res = await registry.handler(new Request("http://localhost" + path));
    const body = (await res.text()).slice(0, 240);
    const tok = ep ? decodeURIComponent(new URL(ep).password) : "";
    console.log(path, res.status, tok ? body.split(tok).join("<r>") : body);
  } catch (e) {
    console.log(path, "threw", String(e instanceof Error ? e.message : e).slice(0, 240));
  }
}
process.exit(0);
