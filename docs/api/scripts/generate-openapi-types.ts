const input = "docs/api/openapi/vortex.openapi.json";
const output = "docs/api/openapi/vortex.openapi.d.ts";

console.log(`Generating OpenAPI TypeScript declarations from ${input}.`);

const proc = Bun.spawn(["bunx", "--bun", "openapi-typescript@7.13.0", input, "-o", output], {
  stderr: "inherit",
  stdout: "inherit"
});

const exitCode = await proc.exited;
if (exitCode !== 0) {
  console.error(
    [
      "OpenAPI type generation failed.",
      "This command uses openapi-typescript through bunx so we do not need to commit another dependency yet.",
      "If you want fully pinned, offline type generation, add openapi-typescript as a root devDependency and keep using this script."
    ].join("\n")
  );
  process.exit(exitCode);
}

const formatProc = Bun.spawn(["bunx", "biome", "check", "--write", output, "--no-errors-on-unmatched"], {
  stderr: "inherit",
  stdout: "inherit"
});

const formatExitCode = await formatProc.exited;
if (formatExitCode !== 0) {
  console.error(`Generated ${output}, but Biome formatting failed.`);
  process.exit(formatExitCode);
}

console.log(`Generated ${output}.`);
