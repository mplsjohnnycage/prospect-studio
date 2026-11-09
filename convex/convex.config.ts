import { defineApp } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config.js";
import { v } from "convex/values";
import agent from "@convex-dev/agent/convex.config.js";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import aggregate from "@convex-dev/aggregate/convex.config.js";
import actionCache from "@convex-dev/action-cache/convex.config.js";
import geo from "@convex-dev/geospatial/convex.config.js";
import firecrawl from "@firecrawl/firecrawl-convex/convex.config.js";
import agentmail from "@agentmail/convex/convex.config.js";
import workpool from "@convex-dev/workpool/convex.config.js";
import mcp from "@convex-dev/mcp/convex.config.js";
import workflow from "@convex-dev/workflow/convex.config.js";
import r2 from "@convex-dev/r2/convex.config.js";
import { defineKeys } from "convex-secret-store";
import secretStore from "convex-secret-store/convex.config";

const app = defineApp({
  env: {
    FIRECRAWL_API_KEY: v.string(),
    FIRECRAWL_WEBHOOK_SECRET: v.optional(v.string()),
    MY_APP_KEK_V1: v.string(),
  },
});

app.use(betterAuth);
app.use(agent);
app.use(rateLimiter);
app.use(aggregate, { name: "prospectCounts" });
app.use(actionCache);
app.use(geo);
app.use(firecrawl, {
  httpPrefix: "/firecrawl/",
  env: {
    FIRECRAWL_API_KEY: app.env.FIRECRAWL_API_KEY,
    FIRECRAWL_WEBHOOK_SECRET: app.env.FIRECRAWL_WEBHOOK_SECRET,
  },
});
app.use(agentmail);
app.use(workpool, { name: "researchPool" });
app.use(mcp);
app.use(workflow);
app.use(r2);
app.use(secretStore, {
  env: {
    SECRET_STORE_KEYS: defineKeys({
      1: process.env.MY_APP_KEK_V1!,
    }),
  },
});

export default app;
