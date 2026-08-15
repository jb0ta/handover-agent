import * as fs from "fs";
import * as path from "path";

/**
 * Wraps the review UI in a complete HTML document.
 *
 * `src/ui/index.html` is page *content*, not a whole document — it is served by
 * the gate server, published as a hosted artifact, and deployed as a static
 * demo, and each of those hosts supplies its own skeleton. Keeping the skeleton
 * here means one file drives all three and none of them can drift.
 */

/** Resolves from `src/ui`, `dist/ui`, and a script run from the repo root. */
export const UI_BODY_PATH = path.join(__dirname, "..", "..", "src", "ui", "index.html");

export interface RenderPageOptions {
  /** Overrides the document title. Defaults to the body's own <title>. */
  title?: string;
  /** Extra tags for <head> — meta description, canonical link, and so on. */
  head?: string;
}

export function renderPage(body: string, options: RenderPageOptions = {}): string {
  const head = [
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    options.title ? `<title>${options.title}</title>` : "",
    options.head ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
${head}
</head>
<body>
${body}
</body>
</html>
`;
}

export function readUiBody(bodyPath: string = UI_BODY_PATH): string {
  if (!fs.existsSync(bodyPath)) {
    throw new Error(`Review UI not found at ${bodyPath}`);
  }
  return fs.readFileSync(bodyPath, "utf-8");
}

export default renderPage;
