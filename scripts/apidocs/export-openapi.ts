import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_PROJECT_ID = "918521";
const DEFAULT_ENV_FILE = "apps/api/.env";
const DEFAULT_OUT_FILE = "docs/api/openapi/vortex.openapi.json";
const APIDOG_API_VERSION = "2024-03-28";

function getArgValue(name: string): string | undefined {
  const equalsPrefix = `${name}=`;
  const inlineValue = Bun.argv.find(arg => arg.startsWith(equalsPrefix));
  if (inlineValue) {
    return inlineValue.slice(equalsPrefix.length);
  }

  const index = Bun.argv.indexOf(name);
  if (index >= 0) {
    return Bun.argv[index + 1];
  }

  return undefined;
}

function parseEnvValue(rawValue: string): string {
  const value = rawValue.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

function loadEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  const env: Record<string, string> = {};
  const contents = readFileSync(filePath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    env[match[1]] = parseEnvValue(match[2]);
  }

  return env;
}

function requireOpenApiDocument(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new Error("Apidog export did not return a JSON object.");
  }

  const doc = value as Record<string, unknown>;
  if (typeof doc.openapi !== "string" || !doc.openapi.startsWith("3.")) {
    throw new Error("Apidog export did not return an OpenAPI 3 document.");
  }

  if (!doc.paths || typeof doc.paths !== "object") {
    throw new Error("Apidog export is missing the OpenAPI paths object.");
  }
}

const projectId = getArgValue("--project-id") ?? process.env.APIDOG_PROJECT_ID ?? DEFAULT_PROJECT_ID;
const envFile = getArgValue("--env-file") ?? process.env.APIDOG_ENV_FILE ?? DEFAULT_ENV_FILE;
const outFile = getArgValue("--out") ?? DEFAULT_OUT_FILE;
const env = loadEnvFile(envFile);
const accessToken = process.env.APIDOG_ACCESS_TOKEN ?? env.APIDOG_ACCESS_TOKEN;

if (!accessToken) {
  console.error(`Missing APIDOG_ACCESS_TOKEN. Set it in the environment or in ${envFile}.`);
  process.exit(1);
}

const response = await fetch(`https://api.apidog.com/v1/projects/${projectId}/export-openapi?locale=en-US`, {
  body: JSON.stringify({
    exportFormat: "JSON",
    oasVersion: "3.1",
    options: {
      addFoldersToTags: false,
      includeApidogExtensionProperties: false
    },
    scope: {
      type: "ALL"
    }
  }),
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "X-Apidog-Api-Version": APIDOG_API_VERSION
  },
  method: "POST"
});

if (!response.ok) {
  const body = await response.text();
  console.error(`Apidog export failed with HTTP ${response.status}.`);
  console.error(body);
  process.exit(1);
}

const document = await response.json();
requireOpenApiDocument(document);

const resolvedOutFile = resolve(outFile);
mkdirSync(dirname(resolvedOutFile), { recursive: true });
writeFileSync(resolvedOutFile, `${JSON.stringify(document, null, 2)}\n`);

const pathCount = Object.keys((document as { paths: Record<string, unknown> }).paths).length;
console.log(`Exported ${pathCount} OpenAPI paths to ${outFile}.`);
