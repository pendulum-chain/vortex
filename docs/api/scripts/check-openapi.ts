import { existsSync, readFileSync } from "node:fs";
import { ONBOARDING_REQUIREMENTS } from "../../../packages/shared/src/endpoints/onboarding-requirements.endpoints";

const OPENAPI_FILE = "docs/api/openapi/vortex.openapi.json";
const MANIFEST_FILE = "docs/api/apidog/page-manifest.json";

const REQUIRED_PATHS = [
  "/v1/api-credentials",
  "/v1/api-credentials/{credentialId}",
  "/v1/alfredpay/alfredpayStatus",
  "/v1/alfredpay/createBusinessCustomer",
  "/v1/alfredpay/createIndividualCustomer",
  "/v1/alfredpay/findKybCustomerAndBusiness",
  "/v1/alfredpay/getKybRedirectLink",
  "/v1/alfredpay/getKycRedirectLink",
  "/v1/alfredpay/getKycStatus",
  "/v1/alfredpay/kycRedirectFinished",
  "/v1/alfredpay/kycRedirectOpened",
  "/v1/alfredpay/retryKyc",
  "/v1/alfredpay/sendKybSubmission",
  "/v1/alfredpay/sendKycSubmission",
  "/v1/alfredpay/submitKybFile",
  "/v1/alfredpay/submitKybInformation",
  "/v1/alfredpay/submitKybRelatedPersonFile",
  "/v1/alfredpay/submitKycFile",
  "/v1/alfredpay/submitKycInformation",
  "/v1/brla/createSubaccount",
  "/v1/brla/getKycStatus",
  "/v1/brla/getSelfieLivenessUrl",
  "/v1/brla/getUploadUrls",
  "/v1/brla/getUser",
  "/v1/brla/getUserRemainingLimit",
  "/v1/brla/kyb/attempt-status",
  "/v1/brla/kyb/documents",
  "/v1/brla/kyb/documents/{documentId}",
  "/v1/brla/kyb/new-level-1/api",
  "/v1/brla/kyb/new-level-1/web-sdk",
  "/v1/brla/kyb/ubos",
  "/v1/brla/kyc/record-attempt",
  "/v1/brla/newKyc",
  "/v1/brla/validatePixKey",
  "/v1/onboarding/requirements",
  "/v1/onboarding/active-entity",
  "/v1/onboarding/status",
  "/v1/public-key",
  "/v1/quotes",
  "/v1/quotes/best",
  "/v1/quotes/{id}",
  "/v1/ramp/history",
  "/v1/ramp/history/{walletAddress}",
  "/v1/ramp-info",
  "/v1/ramp/register",
  "/v1/ramp/start",
  "/v1/ramp/update",
  "/v1/ramp/{id}",
  "/v1/ramp/{id}/errors",
  "/v1/session/create",
  "/v1/supported-countries",
  "/v1/supported-cryptocurrencies",
  "/v1/supported-fiat-currencies",
  "/v1/supported-payment-methods",
  "/v1/webhook",
  "/v1/webhook/{id}"
];

type JsonObject = Record<string, unknown>;

function readJson(filePath: string): JsonObject {
  return JSON.parse(readFileSync(filePath, "utf8")) as JsonObject;
}

function pointerExists(document: unknown, pointer: string): boolean {
  if (!pointer.startsWith("#/")) {
    return false;
  }

  const parts = pointer
    .slice(2)
    .split("/")
    .map(part => part.replace(/~1/g, "/").replace(/~0/g, "~"));

  let current: unknown = document;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return false;
    }

    current = (current as JsonObject)[part];
  }

  return true;
}

function collectRefs(value: unknown, refs: string[] = []): string[] {
  if (!value || typeof value !== "object") {
    return refs;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectRefs(item, refs);
    }
    return refs;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === "$ref" && typeof child === "string") {
      refs.push(child);
    } else {
      collectRefs(child, refs);
    }
  }

  return refs;
}

function findSensitiveMatches(filePath: string): string[] {
  const contents = readFileSync(filePath, "utf8");
  const patterns = [
    {
      name: "Apidog access token",
      regex: /\badgp_[A-Za-z0-9_-]{8,}/g
    },
    {
      name: "Apidog access token assignment",
      regex: /\bAPIDOG_ACCESS_TOKEN\s*=\s*(?!\.\.\.|<)[^\s#'"]{12,}/g
    },
    {
      name: "live/test secret key",
      regex: /\bsk_(?:live|test)_(?!\.\.\.|<)[A-Za-z0-9_-]{8,}/g
    },
    {
      name: "live/test public key",
      regex: /\bpk_(?:live|test)_(?!\.\.\.|<)[A-Za-z0-9_-]{8,}/g
    },
    {
      name: "seed or recovery phrase",
      regex: /\b(?:recovery phrase|mnemonic|seed phrase):\s*`[^`]+`/gi
    },
    {
      name: "private key block",
      regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g
    },
    {
      name: "64-byte hex private key",
      regex: /\b0x[a-fA-F0-9]{64}\b/g
    }
  ];

  const matches: string[] = [];
  for (const pattern of patterns) {
    for (const match of contents.matchAll(pattern.regex)) {
      matches.push(`${pattern.name} in ${filePath}: ${match[0].slice(0, 16)}...`);
    }
  }

  return matches;
}

const openapi = readJson(OPENAPI_FILE);
if (typeof openapi.openapi !== "string" || !openapi.openapi.startsWith("3.")) {
  throw new Error(`${OPENAPI_FILE} must be an OpenAPI 3.x document.`);
}

if (!openapi.paths || typeof openapi.paths !== "object") {
  throw new Error(`${OPENAPI_FILE} is missing paths.`);
}

const paths = Object.keys(openapi.paths as JsonObject);
const missingPaths = REQUIRED_PATHS.filter(requiredPath => !paths.includes(requiredPath));
if (missingPaths.length > 0) {
  throw new Error(`OpenAPI file is missing required documented paths:\n${missingPaths.join("\n")}`);
}

const unresolvedRefs = collectRefs(openapi).filter(ref => !pointerExists(openapi, ref));
if (unresolvedRefs.length > 0) {
  throw new Error(`OpenAPI file has unresolved local refs:\n${unresolvedRefs.join("\n")}`);
}

const documentedOperations = new Map<string, { method: string; path: string }>();
for (const [path, pathItem] of Object.entries(openapi.paths as JsonObject)) {
  if (!pathItem || typeof pathItem !== "object") continue;
  for (const [method, operation] of Object.entries(pathItem as JsonObject)) {
    if (!operation || typeof operation !== "object") continue;
    const operationId = (operation as JsonObject).operationId;
    if (typeof operationId !== "string") continue;
    if (documentedOperations.has(operationId)) {
      throw new Error(`OpenAPI operationId is duplicated: ${operationId}`);
    }
    documentedOperations.set(operationId, { method: method.toUpperCase(), path });
  }
}

for (const flows of Object.values(ONBOARDING_REQUIREMENTS)) {
  for (const requirements of Object.values(flows)) {
    if (!requirements) continue;
    for (const step of requirements.steps) {
      if (step.kind !== "api" || !step.operationId || !step.method || !step.path) continue;
      const operation = documentedOperations.get(step.operationId);
      if (!operation) {
        throw new Error(`Onboarding discovery references missing OpenAPI operationId: ${step.operationId}`);
      }
      if (operation.method !== step.method || operation.path !== step.path) {
        throw new Error(
          `Onboarding discovery operation ${step.operationId} maps to ${step.method} ${step.path}, not ${operation.method} ${operation.path}`
        );
      }
      if (step.requestSchema && !pointerExists(openapi, step.requestSchema)) {
        throw new Error(`Onboarding discovery references missing OpenAPI schema: ${step.requestSchema}`);
      }
    }
  }
}

const manifest = readJson(MANIFEST_FILE);
if (!Array.isArray(manifest.pages)) {
  throw new Error(`${MANIFEST_FILE} must contain a pages array.`);
}

const pageFiles = manifest.pages.map(page => {
  if (!page || typeof page !== "object") {
    throw new Error(`${MANIFEST_FILE} contains an invalid page entry.`);
  }

  const source = (page as JsonObject).source;
  const title = (page as JsonObject).title;
  const order = (page as JsonObject).order;
  if (typeof source !== "string" || typeof title !== "string" || typeof order !== "number") {
    throw new Error(`${MANIFEST_FILE} page entries must include numeric order, source, and title.`);
  }

  if (!existsSync(source)) {
    throw new Error(`Manifest page source does not exist: ${source}`);
  }

  const markdown = readFileSync(source, "utf8");
  const expectedHeading = `# ${title}`;
  if (!markdown.includes(expectedHeading)) {
    throw new Error(`Manifest title "${title}" was not found as a heading in ${source}.`);
  }

  return source;
});

const filesToScan = [OPENAPI_FILE, MANIFEST_FILE, ...pageFiles];
const sensitiveMatches = filesToScan.flatMap(findSensitiveMatches);
if (sensitiveMatches.length > 0) {
  throw new Error(`Potential sensitive values found:\n${sensitiveMatches.join("\n")}`);
}

console.log(`OpenAPI check passed: ${paths.length} paths, ${collectRefs(openapi).length} local refs.`);
console.log(`Docs page check passed: ${pageFiles.length} Markdown pages listed in ${MANIFEST_FILE}.`);
