/**
 * EveryDeliver — Plugin Build Script
 *
 * Compiles plugin TypeScript files to JavaScript for Chrome Extension MV3.
 * Each entry point is bundled separately with its imports inlined.
 *
 * Usage: node plugin/build.js
 */

import * as esbuild from "esbuild";

const entryPoints = {
  "content-script": "plugin/content-script.ts",
  "popup": "plugin/popup.ts",
  "background": "plugin/background.ts",
};

const outdir = "plugin";

async function build() {
  console.log("[plugin] Building Chrome Extension...\n");

  // Build each entry point separately
  for (const [name, entry] of Object.entries(entryPoints)) {
    await esbuild.build({
      entryPoints: [entry],
      outfile: `${outdir}/${name}.js`,
      bundle: true,
      format: "iife", // IIFE for content scripts & service workers
      target: ["chrome100"],
      platform: "browser",
      minify: false,  // Keep readable for debugging
      sourcemap: false,
      logLevel: "info",
    });
    console.log(`  ✔ ${name}.js`);
  }

  console.log("\n[plugin] Done! Files in plugin/ are ready to load as Chrome Extension.");
}

build().catch((err) => {
  console.error("[plugin] Build failed:", err);
  process.exit(1);
});
