import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Add package.json to CommonJS output to mark it as CommonJS
const cjsPackageJson = {
  type: "commonjs"
};

const cjsPath = join(__dirname, "../dist/cjs");

try {
  // Ensure directory exists
  mkdirSync(cjsPath, { recursive: true });

  // Write package.json
  writeFileSync(join(cjsPath, "package.json"), JSON.stringify(cjsPackageJson, null, 2) + "\n");

  console.log("✓ Post-build complete: CommonJS package.json created");
} catch (error) {
  console.error("✗ Post-build failed:", error.message);
  process.exit(1);
}
