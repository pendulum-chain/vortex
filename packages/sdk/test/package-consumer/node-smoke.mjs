const resolved = import.meta.resolve("@vortexfi/sdk");
if (!resolved.endsWith("/dist/index.js")) {
  throw new Error(`Expected the Node SDK artifact, resolved ${resolved}`);
}

await import("@vortexfi/sdk");
