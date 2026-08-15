import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { buildDemo } from "../scripts/build-demo";
import { renderPage, readUiBody } from "../src/ui/renderPage";

/**
 * The static demo is published publicly, so what it does and does not contain
 * matters more than for a local tool. These tests pin both.
 */

let outDir: string;

beforeEach(() => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), "handover-demo-"));
});

afterEach(() => {
  fs.rmSync(outDir, { recursive: true, force: true });
});

function build(): string {
  return fs.readFileSync(buildDemo(outDir), "utf-8");
}

describe("renderPage", () => {
  it("produces a complete document around the body fragment", () => {
    const html = renderPage("<p>hello</p>");
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta charset="utf-8" />');
    expect(html).toContain('name="viewport"');
    expect(html).toContain("<p>hello</p>");
  });

  it("leaves the body's own <title> alone unless overridden", () => {
    expect(renderPage("<title>From body</title>")).not.toMatch(/<title>(?!From body)/);
    expect(renderPage("<p>x</p>", { title: "Override" })).toContain(
      "<title>Override</title>"
    );
  });

  it("reads the real UI body", () => {
    expect(readUiBody()).toContain('id="btn-approve"');
  });

  it("reports a missing UI file rather than emitting an empty page", () => {
    expect(() => readUiBody(path.join(outDir, "nope.html"))).toThrow(
      /Review UI not found/
    );
  });
});

describe("static demo build", () => {
  it("writes index.html and .nojekyll", () => {
    buildDemo(outDir);
    expect(fs.existsSync(path.join(outDir, "index.html"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, ".nojekyll"))).toBe(true);
  });

  it("ships the same UI the gate server serves", () => {
    const html = build();
    const body = readUiBody();
    expect(html).toContain(body);
  });

  it("is a complete, self-describing document", () => {
    const html = build();
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain("<title>Handover Approval Gate</title>");
    expect(html).toContain('name="description"');
  });

  it("carries the preview banner that says the browser does not enforce the rules", () => {
    const html = build();
    expect(html).toContain('id="preview-banner"');
    expect(html).toMatch(/enforced by\s*\n?\s*<code>src\/approval\/ApprovalGate\.ts<\/code>/);
  });

  // The demo is public. It must be a self-contained page with no calls out.
  it("loads no external resources", () => {
    const html = build();
    expect(html).not.toMatch(/<script[^>]+\ssrc=/i);
    expect(html).not.toMatch(/<link[^>]+rel=["']stylesheet["']/i);
    expect(html).not.toMatch(/@import\s/i);
    expect(html).not.toMatch(/https?:\/\/(?!github\.com\/jb0ta\/handover-agent)/);
  });

  // Guards against a future edit pasting a real engagement into the fallback.
  it("contains only the fictional sample, no real client material", () => {
    const html = build();
    // The fixed IDs of the canned sample. If someone ever pastes a real
    // engagement into the fallback, these go with it.
    expect(html).toContain("TechFlow Inc.");
    expect(html).toContain("brief-4f21c0de-9a77-4d0e-b3aa-1c6f2f8e1b04");
    expect(html).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
    expect(html).not.toMatch(/\bAKIA[0-9A-Z]{16}\b/);
    expect(html).not.toMatch(/\bgh[pousr]_[A-Za-z0-9]{20,}/);
    expect(html).not.toMatch(/\bsk-[A-Za-z0-9]{20,}/);
  });
});
