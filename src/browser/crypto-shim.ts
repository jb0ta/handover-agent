/**
 * Browser stand-in for the `randomUUID` the core imports from Node's `crypto`.
 *
 * `scripts/build-browser.ts` aliases the `crypto` module to this file, so the
 * core keeps its Node-idiomatic import and the bundle gets the platform
 * equivalent. Both produce the same shape — lowercase hex with dashes — which
 * is what the schemas' `^brief-[a-z0-9-]+$` patterns expect.
 *
 * `crypto.randomUUID` needs a secure context. `https://` and `file://` both
 * qualify, which covers the published demo and a locally opened build. If it
 * is ever missing, that is a fact worth surfacing rather than papering over
 * with `Math.random()` — these IDs tie a brief to its vault and its audit
 * entries, and a weak fallback would be a silent downgrade.
 */
export function randomUUID(): string {
  const webCrypto = globalThis.crypto;

  if (!webCrypto || typeof webCrypto.randomUUID !== "function") {
    throw new Error(
      "crypto.randomUUID() is unavailable. This page needs a secure context " +
        "(https:// or file://) to generate engagement IDs."
    );
  }

  return webCrypto.randomUUID();
}

export default { randomUUID };
