/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as assistant from "../assistant.js";
import type * as auth from "../auth.js";
import type * as autopilot from "../autopilot.js";
import type * as autopilotService from "../autopilotService.js";
import type * as calendar from "../calendar.js";
import type * as crons from "../crons.js";
import type * as demoSubmissions from "../demoSubmissions.js";
import type * as demos from "../demos.js";
import type * as email from "../email.js";
import type * as geospatial from "../geospatial.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as identity from "../identity.js";
import type * as outreach from "../outreach.js";
import type * as prospects from "../prospects.js";
import type * as research from "../research.js";
import type * as sales from "../sales.js";
import type * as suppressions from "../suppressions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  assistant: typeof assistant;
  auth: typeof auth;
  autopilot: typeof autopilot;
  autopilotService: typeof autopilotService;
  calendar: typeof calendar;
  crons: typeof crons;
  demoSubmissions: typeof demoSubmissions;
  demos: typeof demos;
  email: typeof email;
  geospatial: typeof geospatial;
  health: typeof health;
  http: typeof http;
  identity: typeof identity;
  outreach: typeof outreach;
  prospects: typeof prospects;
  research: typeof research;
  sales: typeof sales;
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
};
