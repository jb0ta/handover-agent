import { buildBrowserBundle } from "../src/browser/bundle";

/** CLI wrapper: `npm run browser:build`. The bundler itself lives in src. */
buildBrowserBundle()
  .then((code) => {
    console.log(`✓ Built browser bundle: ${(code.length / 1024).toFixed(1)} kB`);
  })
  .catch((error) => {
    console.error("❌ Browser bundle failed:", error);
    process.exit(1);
  });
