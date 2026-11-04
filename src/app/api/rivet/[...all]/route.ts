// Rivet Cloud is the engine; this route is where it wakes our actors on Vercel
// (serverless pool). RivetKit checks every /start request against the private
// endpoint in RIVET_ENDPOINT, so the route stays off until that is configured.
import {registry} from "@/lib/rivet";
import {rivetRouteEnabled} from "@/lib/rivet-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Hobby allows 300 s per request. The pool's requestLifespan must stay below
// this (270 s), so actors drain before Vercel cuts the request.
export const maxDuration = 300;

async function handle(req: Request): Promise<Response> {
  if (!rivetRouteEnabled(process.env.RIVET_ENDPOINT)) {
    return Response.json({error: "Rivet serverless runner is not configured"}, {status: 503});
  }
  return registry.handler(req);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const PATCH = handle;
export const HEAD = handle;
export const OPTIONS = handle;
