/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actorEvents from "../actorEvents.js";
import type * as agentTools from "../agentTools.js";
import type * as alerts from "../alerts.js";
import type * as assistant from "../assistant.js";
import type * as auth from "../auth.js";
import type * as autopilot from "../autopilot.js";
import type * as autopilotService from "../autopilotService.js";
import type * as bookings from "../bookings.js";
import type * as calendar from "../calendar.js";
import type * as crons from "../crons.js";
import type * as demoSubmissions from "../demoSubmissions.js";
import type * as demos from "../demos.js";
import type * as email from "../email.js";
import type * as followups from "../followups.js";
import type * as geospatial from "../geospatial.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as identity from "../identity.js";
import type * as imports from "../imports.js";
import type * as mcp from "../mcp.js";
import type * as outcomes from "../outcomes.js";
import type * as outreach from "../outreach.js";
import type * as pipeline from "../pipeline.js";
import type * as places from "../places.js";
import type * as pricing from "../pricing.js";
import type * as production from "../production.js";
import type * as prospects from "../prospects.js";
import type * as r2 from "../r2.js";
import type * as r2Credentials from "../r2Credentials.js";
import type * as research from "../research.js";
import type * as sales from "../sales.js";
import type * as secrets from "../secrets.js";
import type * as storage from "../storage.js";
import type * as storageActions from "../storageActions.js";
import type * as suppressions from "../suppressions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  actorEvents: typeof actorEvents;
  agentTools: typeof agentTools;
  alerts: typeof alerts;
  assistant: typeof assistant;
  auth: typeof auth;
  autopilot: typeof autopilot;
  autopilotService: typeof autopilotService;
  bookings: typeof bookings;
  calendar: typeof calendar;
  crons: typeof crons;
  demoSubmissions: typeof demoSubmissions;
  demos: typeof demos;
  email: typeof email;
  followups: typeof followups;
  geospatial: typeof geospatial;
  health: typeof health;
  http: typeof http;
  identity: typeof identity;
  imports: typeof imports;
  mcp: typeof mcp;
  outcomes: typeof outcomes;
  outreach: typeof outreach;
  pipeline: typeof pipeline;
  places: typeof places;
  pricing: typeof pricing;
  production: typeof production;
  prospects: typeof prospects;
  r2: typeof r2;
  r2Credentials: typeof r2Credentials;
  research: typeof research;
  sales: typeof sales;
  secrets: typeof secrets;
  storage: typeof storage;
  storageActions: typeof storageActions;
  suppressions: typeof suppressions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  prospectCounts: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"prospectCounts">;
  actionCache: import("@convex-dev/action-cache/_generated/component.js").ComponentApi<"actionCache">;
  geospatial: import("@convex-dev/geospatial/_generated/component.js").ComponentApi<"geospatial">;
  firecrawl: import("@firecrawl/firecrawl-convex/_generated/component.js").ComponentApi<"firecrawl">;
  agentmail: import("@agentmail/convex/_generated/component.js").ComponentApi<"agentmail">;
  researchPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"researchPool">;
  mcp: import("@convex-dev/mcp/_generated/component.js").ComponentApi<"mcp">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  r2: import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
  secretStore: import("convex-secret-store/_generated/component.js").ComponentApi<"secretStore">;
};
