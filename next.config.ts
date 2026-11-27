import type { NextConfig } from "next";

// One id per build, shared by every process of that build (workers inherit the environment):
// a base-36 timestamp padded to a fixed width, so ids sort in build order. The service worker uses
// it to name its cache, and the client registers `/sw.js?v=<id>`, so each build installs a new worker.
const buildId = (process.env.AM_BUILD_ID ??= Date.now().toString(36).padStart(9, "0"));

// AM_EXPORT=1 makes a static export (plain files in `out/`, served by any web server with no Node): this is what
// is deployed. Without it the build is the usual one for `next start`, which the browser tests use.
const staticExport = process.env.AM_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(staticExport ? { output: "export" as const } : {}),
  // The end-to-end build (see playwright.config.ts) goes to its own folder, so it can never replace
  // the normal build in `.next`.
  distDir: process.env.AM_DIST_DIR || (staticExport ? "out" : ".next"),
  env: {
    // Exposed to client code as process.env.AM_BUILD_ID (inlined at build time).
    AM_BUILD_ID: buildId,
    // Always a build-time constant ('' in a normal build), so the test-only branches that compare it
    // with '1' are removed from every normal build.
    NEXT_PUBLIC_E2E: process.env.NEXT_PUBLIC_E2E ?? "",
  },
  generateBuildId: async () => buildId,
  // A static export has no server to send headers: the web server's own config sends these (deploy/accounts.caddy).
  headers: staticExport ? undefined : async () => {
    return [
      {
        // The browser must always fetch the latest worker script.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
