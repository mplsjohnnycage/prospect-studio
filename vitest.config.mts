import {defineConfig} from "vitest/config";
export default defineConfig({test:{include:["convex/**/*.convex.test.ts"],environment:"edge-runtime",server:{deps:{inline:["convex-test"]}}}});
