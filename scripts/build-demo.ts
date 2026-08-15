import * as fs from "fs";
import * as path from "path";
import { renderPage, readUiBody } from "../src/ui/renderPage";
import { buildBrowserBundle } from "../src/browser/bundle";

/**
 * Builds the static demo of the review UI for GitHub Pages.
 *
 * This is the same `src/ui/index.html` the gate server serves, with the real
 * core bundled in so a visitor can start their own handover and watch intake,
 * vault packaging and the approval gate run on what they typed.
 *
 * Nothing is deployed that could leak: the sample is fictional, no API is
 * reachable, and the page makes no network requests at all — whatever a
 * visitor enters stays in their tab.
 */

const OUT_DIR = process.env.DEMO_OUT_DIR ?? "./dist-demo";

const HEAD = `
<meta name="description" content="Static preview of the Handover Agent approval gate — the human review screen that decides whether a client's materials reach a freelancer." />
<meta name="robots" content="index, follow" />
`.trim();

export async function buildDemo(outDir: string = OUT_DIR): Promise<string> {
  const script = await buildBrowserBundle();
  const html = renderPage(readUiBody(), { head: HEAD, script });

  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "index.html");
  fs.writeFileSync(outFile, html);

  // Tells GitHub Pages not to run the output through Jekyll.
  fs.writeFileSync(path.join(outDir, ".nojekyll"), "");

  return outFile;
}

if (require.main === module) {
  buildDemo()
    .then((outFile) => {
      const bytes = fs.statSync(outFile).size;
      console.log(
        `✓ Built static demo: ${outFile} (${(bytes / 1024).toFixed(1)} kB)`
      );
    })
    .catch((error) => {
      console.error("❌ Demo build failed:", error);
      process.exit(1);
    });
}

export default buildDemo;
