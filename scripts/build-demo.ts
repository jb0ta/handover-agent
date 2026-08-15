import * as fs from "fs";
import * as path from "path";
import { renderPage, readUiBody } from "../src/ui/renderPage";

/**
 * Builds the static demo of the review UI for GitHub Pages.
 *
 * This is the same `src/ui/index.html` the gate server serves. With no server
 * to talk to, the page falls back to its built-in sample and shows a preview
 * banner saying so — the refusal rules it mirrors client-side are a
 * demonstration, and the server is what enforces them.
 *
 * Nothing about a real engagement is deployed: the sample is fictional, no
 * API is reachable, and no decision is written anywhere.
 */

const OUT_DIR = process.env.DEMO_OUT_DIR ?? "./dist-demo";

const HEAD = `
<meta name="description" content="Static preview of the Handover Agent approval gate — the human review screen that decides whether a client's materials reach a freelancer." />
<meta name="robots" content="index, follow" />
`.trim();

export function buildDemo(outDir: string = OUT_DIR): string {
  const html = renderPage(readUiBody(), { head: HEAD });

  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "index.html");
  fs.writeFileSync(outFile, html);

  // Tells GitHub Pages not to run the output through Jekyll.
  fs.writeFileSync(path.join(outDir, ".nojekyll"), "");

  return outFile;
}

if (require.main === module) {
  const outFile = buildDemo();
  const bytes = fs.statSync(outFile).size;
  console.log(`✓ Built static demo: ${outFile} (${(bytes / 1024).toFixed(1)} kB)`);
}

export default buildDemo;
