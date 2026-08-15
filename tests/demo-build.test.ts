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

async function build(): Promise<string> {
  return fs.readFileSync(await buildDemo(outDir), "utf-8");
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
  it("writes index.html and .nojekyll", async () => {
    await buildDemo(outDir);
    expect(fs.existsSync(path.join(outDir, "index.html"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, ".nojekyll"))).toBe(true);
  });

  it("ships the same UI the gate server serves", async () => {
    const html = await build();
    const body = readUiBody();
    expect(html).toContain(body);
  });

  it("is a complete, self-describing document", async () => {
    const html = await build();
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain("<title>Handover Approval Gate</title>");
    expect(html).toContain('name="description"');
  });

  it("says what the page is and that nothing leaves it", async () => {
    const html = await build();
    expect(html).toContain('id="preview-banner"');
    expect(html).toMatch(/<code>src\/approval\/ApprovalGate\.ts<\/code>/);
    expect(html).toMatch(/[Nn]othing is sent anywhere/);
  });

  it("bundles the real core rather than a mock of it", async () => {
    const html = await build();
    // Distinctive strings from the actual modules. If the page ever went back
    // to a hand-written mirror of the gate's rules, these would vanish.
    expect(html).toContain("looks like an automated identity");
    expect(html).toContain("A decision cannot be changed");
    expect(html).toContain("freelancer_only");
    // The schemas are inlined, so no fetch is needed to validate.
    expect(html).toContain("handover-agent.local/schemas/brief.v0.1.0.json");
  });

  it("ships the form a visitor starts their own handover in", async () => {
    const html = await build();
    expect(html).toContain('id="new-form"');
    expect(html).toContain('id="f-objective"');
    expect(html).toContain('id="materials"');
    expect(html).toContain('id="add-material"');
    expect(html).toContain("credentials_or_keys");
  });

  it("tells the visitor their typing stays in the tab", async () => {
    const html = await build();
    expect(html).toMatch(/[Ss]tays in this tab/);
    expect(html).toMatch(/no network requests and stores nothing/);
  });

  // Someone landing cold saw a finished engagement awaiting a decision, with
  // no indication of what the screen was or where an engagement comes from.
  it("explains where the screen sits in the process", async () => {
    const html = await build();
    expect(html).toContain("You decide");
    expect(html).toMatch(/Client answers the skill's questions/);
    expect(html).toMatch(/Agent packages a brief and a scoped vault/);
  });

  it("offers a primary action to start over, outside the decision panel", async () => {
    const html = await build();
    expect(html).toContain('id="btn-new"');
    // The old affordance was a ghost button buried among Approve/Reject.
    expect(html).not.toContain('id="btn-reset"');
    const newButtonAt = html.indexOf('id="btn-new"');
    const decisionPanelAt = html.indexOf('id="gate"');
    expect(newButtonAt).toBeLessThan(decisionPanelAt);
  });

  it("points at how to run a real engagement", async () => {
    const html = await build();
    expect(html).toContain('id="howto-link"');
    expect(html).toMatch(/Run this on your own engagement/);
  });

  // The demo is public and now carries a form. It must be self-contained: a
  // visitor's typing has to stay in the tab, with nothing able to send it out.
  //
  // These assert *load mechanisms*, not URL-shaped strings. Since the bundle
  // inlines the schemas, the page legitimately contains URLs — `$id`,
  // `$schema`, and AJV's internal ref names are identifiers that are never
  // fetched. An earlier version of this test matched any `https?://` and so
  // failed on those, which would have taught us to loosen it rather than
  // check the thing that matters.
  it("has no way to load anything", async () => {
    const html = await build();
    expect(html).not.toMatch(/<script[^>]+\ssrc=/i);
    expect(html).not.toMatch(/<link[^>]+rel=["']stylesheet["']/i);
    expect(html).not.toMatch(/@import\s/i);
    expect(html).not.toMatch(/<(img|iframe|video|audio|embed|object)\b/i);
  });

  it("has no way to send anything out", async () => {
    const html = await build();
    expect(html).not.toMatch(/fetch\(\s*["'`]https?:\/\//i);
    expect(html).not.toMatch(/\bXMLHttpRequest\b/);
    expect(html).not.toMatch(/new\s+WebSocket\b/);
    expect(html).not.toMatch(/navigator\.sendBeacon\b/);
    expect(html).not.toMatch(/\bimportScripts\b/);
    expect(html).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it("points off-origin only at its own repository", async () => {
    const html = await build();
    const offOrigin = (html.match(/\s(?:src|href)="[^"]*:\/\/[^"]*"/gi) ?? [])
      .map((attr) => attr.trim())
      .filter((attr) => !attr.includes("github.com/jb0ta/handover-agent"));
    expect(offOrigin).toEqual([]);
  });

  // Guards against a future edit pasting a real engagement into the fallback.
  it("contains only the fictional sample, no real client material", async () => {
    const html = await build();
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
