import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ONBOARDING_REQUIREMENTS } from "../../../packages/shared/src/endpoints/onboarding-requirements.endpoints";

const OPENAPI_FILE = "docs/api/openapi/vortex.openapi.json";
const GENERATED_TYPES_FILE = "docs/api/openapi/vortex.openapi.d.ts";
const GENERATOR_FILE = "docs/api/scripts/generate-openapi-types.ts";
const MANIFEST_FILE = "docs/api/apidog/page-manifest.json";

const REQUIRED_PATHS = [
  "/v1/api-credentials",
  "/v1/api-credentials/{credentialId}",
  "/v1/alfredpay/alfredpayStatus",
  "/v1/alfredpay/createBusinessCustomer",
  "/v1/alfredpay/createIndividualCustomer",
  "/v1/alfredpay/fiatAccounts",
  "/v1/alfredpay/fiatAccounts/{fiatAccountId}",
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
  "/v1/managed-profiles",
  "/v1/managed-profiles/{profileId}",
  "/v1/managed-profiles/{profileId}/api-credentials",
  "/v1/managed-profiles/{profileId}/api-credentials/{credentialId}",
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

const MANAGED_PROFILE_OPERATIONS = [
  ["/v1/managed-profiles", "get", ["200", "400", "401", "403", "409", "500"]],
  ["/v1/managed-profiles", "post", ["200", "201", "400", "401", "403", "409", "500"]],
  ["/v1/managed-profiles/{profileId}", "get", ["200", "400", "401", "403", "404", "409", "500"]],
  ["/v1/managed-profiles/{profileId}", "delete", ["204", "400", "401", "403", "404", "500"]],
  ["/v1/managed-profiles/{profileId}/api-credentials", "get", ["200", "400", "401", "403", "404", "500"]],
  ["/v1/managed-profiles/{profileId}/api-credentials", "post", ["201", "400", "401", "403", "404", "409", "500"]],
  ["/v1/managed-profiles/{profileId}/api-credentials/{credentialId}", "delete", ["204", "400", "401", "403", "404", "500"]]
] as const;

const MANAGED_PROFILE_SECURITY = [{ SecretApiKey: [] }, { BearerAuth: [] }] as const;

const MANAGED_PROFILE_PATHS = [
  "/v1/managed-profiles",
  "/v1/managed-profiles/{profileId}",
  "/v1/managed-profiles/{profileId}/api-credentials",
  "/v1/managed-profiles/{profileId}/api-credentials/{credentialId}"
] as const;

const ALFREDPAY_OPERATIONS = [
  ["/v1/alfredpay/alfredpayStatus", "get"],
  ["/v1/alfredpay/createBusinessCustomer", "post"],
  ["/v1/alfredpay/createIndividualCustomer", "post"],
  ["/v1/alfredpay/fiatAccounts", "get"],
  ["/v1/alfredpay/fiatAccounts", "post"],
  ["/v1/alfredpay/fiatAccounts/{fiatAccountId}", "delete"],
  ["/v1/alfredpay/findKybCustomerAndBusiness", "get"],
  ["/v1/alfredpay/getKybRedirectLink", "get"],
  ["/v1/alfredpay/getKycRedirectLink", "get"],
  ["/v1/alfredpay/getKycStatus", "get"],
  ["/v1/alfredpay/kycRedirectFinished", "post"],
  ["/v1/alfredpay/kycRedirectOpened", "post"],
  ["/v1/alfredpay/retryKyc", "post"],
  ["/v1/alfredpay/sendKybSubmission", "post"],
  ["/v1/alfredpay/sendKycSubmission", "post"],
  ["/v1/alfredpay/submitKybFile", "post"],
  ["/v1/alfredpay/submitKybInformation", "post"],
  ["/v1/alfredpay/submitKybRelatedPersonFile", "post"],
  ["/v1/alfredpay/submitKycFile", "post"],
  ["/v1/alfredpay/submitKycInformation", "post"]
] as const;

const MANAGED_SELECTOR_SECURITY_OPERATIONS = [
  ...ALFREDPAY_OPERATIONS,
  ["/v1/brla/createSubaccount", "post"],
  ["/v1/brla/getKycStatus", "get"],
  ["/v1/brla/getSelfieLivenessUrl", "get"],
  ["/v1/brla/getUploadUrls", "post"],
  ["/v1/brla/kyb/attempt-status", "get"],
  ["/v1/brla/kyb/new-level-1/web-sdk", "post"],
  ["/v1/brla/kyc/record-attempt", "post"],
  ["/v1/brla/newKyc", "post"],
  ["/v1/onboarding/status", "get"]
] as const;

const DELEGATED_OPERATIONS = [
  ["/v1/alfredpay/alfredpayStatus", "get"],
  ["/v1/alfredpay/createBusinessCustomer", "post"],
  ["/v1/alfredpay/createIndividualCustomer", "post"],
  ["/v1/alfredpay/fiatAccounts", "get"],
  ["/v1/alfredpay/fiatAccounts", "post"],
  ["/v1/alfredpay/fiatAccounts/{fiatAccountId}", "delete"],
  ["/v1/alfredpay/findKybCustomerAndBusiness", "get"],
  ["/v1/alfredpay/getKybRedirectLink", "get"],
  ["/v1/alfredpay/getKycRedirectLink", "get"],
  ["/v1/alfredpay/getKycStatus", "get"],
  ["/v1/alfredpay/kycRedirectFinished", "post"],
  ["/v1/alfredpay/kycRedirectOpened", "post"],
  ["/v1/alfredpay/retryKyc", "post"],
  ["/v1/alfredpay/sendKybSubmission", "post"],
  ["/v1/alfredpay/sendKycSubmission", "post"],
  ["/v1/alfredpay/submitKybFile", "post"],
  ["/v1/alfredpay/submitKybInformation", "post"],
  ["/v1/alfredpay/submitKybRelatedPersonFile", "post"],
  ["/v1/alfredpay/submitKycFile", "post"],
  ["/v1/alfredpay/submitKycInformation", "post"],
  ["/v1/brla/createSubaccount", "post"],
  ["/v1/brla/getKycStatus", "get"],
  ["/v1/brla/getSelfieLivenessUrl", "get"],
  ["/v1/brla/getUploadUrls", "post"],
  ["/v1/brla/getUser", "get"],
  ["/v1/brla/getUserRemainingLimit", "get"],
  ["/v1/brla/kyb/attempt-status", "get"],
  ["/v1/brla/kyb/new-level-1/web-sdk", "post"],
  ["/v1/brla/kyc/record-attempt", "post"],
  ["/v1/brla/newKyc", "post"],
  ["/v1/limits", "post"],
  ["/v1/onboarding/status", "get"],
  ["/v1/quotes", "post"],
  ["/v1/quotes/best", "post"],
  ["/v1/ramp-info", "get"],
  ["/v1/ramp/{id}", "get"],
  ["/v1/ramp/{id}/errors", "get"],
  ["/v1/ramp/history", "get"],
  ["/v1/ramp/history/{walletAddress}", "get"],
  ["/v1/ramp/register", "post"],
  ["/v1/ramp/start", "post"],
  ["/v1/ramp/update", "post"]
] as const;

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

function valueAtPointer(document: unknown, pointer: string): unknown {
  if (!pointer.startsWith("#/")) return undefined;
  return pointer
    .slice(2)
    .split("/")
    .map(part => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>((current, part) => {
      if (!current || typeof current !== "object" || !(part in current)) return undefined;
      return (current as JsonObject)[part];
    }, document);
}

function transitivelyReferences(value: unknown, target: string, seen = new Set<string>()): boolean {
  for (const ref of collectRefs(value)) {
    if (ref === target) return true;
    if (!seen.has(ref)) {
      seen.add(ref);
      if (transitivelyReferences(valueAtPointer(openapi, ref), target, seen)) return true;
    }
  }
  return false;
}

async function checkGeneratedTypes(): Promise<void> {
  const currentDeclarations = readFileSync(GENERATED_TYPES_FILE, "utf8");
  const proc = Bun.spawn(["bun", GENERATOR_FILE], { stderr: "pipe", stdout: "pipe" });
  const [exitCode, stderr, stdout] = await Promise.all([
    proc.exited,
    new Response(proc.stderr).text(),
    new Response(proc.stdout).text()
  ]);

  let generatedDeclarations: string;
  try {
    generatedDeclarations = readFileSync(GENERATED_TYPES_FILE, "utf8");
  } finally {
    writeFileSync(GENERATED_TYPES_FILE, currentDeclarations);
  }

  if (exitCode !== 0) {
    throw new Error(`OpenAPI type generation failed during freshness check:\n${stderr || stdout}`);
  }
  if (generatedDeclarations !== currentDeclarations) {
    throw new Error(`${GENERATED_TYPES_FILE} is stale. Run \`bun run docs:api:types\` and commit the generated result.`);
  }
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

const exposedAdminPaths = paths.filter(path => path.startsWith("/v1/admin/"));
if (exposedAdminPaths.length > 0) {
  throw new Error(`OpenAPI file must not expose admin routes:\n${exposedAdminPaths.join("\n")}`);
}

const unexpectedManagedProfilePaths = paths.filter(
  path =>
    path.startsWith("/v1/managed-profiles") && !MANAGED_PROFILE_PATHS.includes(path as (typeof MANAGED_PROFILE_PATHS)[number])
);
if (unexpectedManagedProfilePaths.length > 0) {
  throw new Error(`OpenAPI file exposes unexpected managed-profile paths:\n${unexpectedManagedProfilePaths.join("\n")}`);
}

const httpMethods = new Set(["delete", "get", "head", "options", "patch", "post", "put", "trace"]);
const documentedAlfredpayOperations = paths
  .filter(path => path.startsWith("/v1/alfredpay/"))
  .flatMap(path => {
    const pathItem = (openapi.paths as JsonObject)[path] as JsonObject;
    return Object.keys(pathItem)
      .filter(method => httpMethods.has(method))
      .map(method => `${method.toUpperCase()} ${path}`);
  })
  .sort();
const requiredAlfredpayOperations = ALFREDPAY_OPERATIONS.map(([path, method]) => `${method.toUpperCase()} ${path}`).sort();
if (JSON.stringify(documentedAlfredpayOperations) !== JSON.stringify(requiredAlfredpayOperations)) {
  throw new Error("OpenAPI file must expose exactly the approved selector-enabled Alfredpay operations.");
}

const documentedManagedProfileOperations = MANAGED_PROFILE_PATHS.flatMap(path => {
  const pathItem = (openapi.paths as JsonObject)[path] as JsonObject;
  return Object.keys(pathItem)
    .filter(method => httpMethods.has(method))
    .map(method => `${method.toUpperCase()} ${path}`);
});
const requiredManagedProfileOperations = MANAGED_PROFILE_OPERATIONS.map(
  ([path, method]) => `${method.toUpperCase()} ${path}`
).sort();
if (JSON.stringify(documentedManagedProfileOperations.sort()) !== JSON.stringify(requiredManagedProfileOperations)) {
  throw new Error("OpenAPI file must expose exactly the seven approved public managed-profile operations.");
}

function operationAt(path: string, method: string): JsonObject {
  const pathItem = (openapi.paths as JsonObject)[path];
  const operation = pathItem && typeof pathItem === "object" ? (pathItem as JsonObject)[method] : undefined;
  if (!operation || typeof operation !== "object") {
    throw new Error(`OpenAPI file is missing required operation: ${method.toUpperCase()} ${path}`);
  }
  return operation as JsonObject;
}

for (const [path, method, requiredStatuses] of MANAGED_PROFILE_OPERATIONS) {
  const operation = operationAt(path, method);
  const responses = operation.responses as JsonObject | undefined;
  const actualStatuses = responses ? Object.keys(responses).sort() : [];
  const expectedStatuses = [...requiredStatuses].sort();
  if (JSON.stringify(actualStatuses) !== JSON.stringify(expectedStatuses)) {
    throw new Error(
      `${method.toUpperCase()} ${path} must document exactly responses ${expectedStatuses.join(", ")}; received ${actualStatuses.join(", ") || "none"}.`
    );
  }

  const actualSecurity = Array.isArray(operation.security)
    ? operation.security.map(requirement => JSON.stringify(requirement)).sort()
    : [];
  const expectedSecurity = MANAGED_PROFILE_SECURITY.map(requirement => JSON.stringify(requirement)).sort();
  if (JSON.stringify(actualSecurity) !== JSON.stringify(expectedSecurity)) {
    throw new Error(
      `${method.toUpperCase()} ${path} must allow exactly manager secret-key or Bearer authentication alternatives.`
    );
  }
}

const createManagedProfile = operationAt("/v1/managed-profiles", "post");
const createManagedProfileResponses = createManagedProfile.responses as JsonObject;
if (
  JSON.stringify(createManagedProfile.requestBody).includes("#/components/schemas/CreateManagedProfileRequest") === false ||
  JSON.stringify(createManagedProfileResponses["200"]).includes("#/components/schemas/ManagedProfileResponse") === false ||
  JSON.stringify(createManagedProfileResponses["201"]).includes("#/components/schemas/ManagedProfileResponse") === false
) {
  throw new Error("POST /v1/managed-profiles must document its request and both idempotent response schemas.");
}

const listManagedProfiles = operationAt("/v1/managed-profiles", "get");
const listParameters = Array.isArray(listManagedProfiles.parameters) ? listManagedProfiles.parameters : [];
const listParameter = (name: string): JsonObject | undefined =>
  listParameters.find(parameter => parameter && typeof parameter === "object" && (parameter as JsonObject).name === name) as
    | JsonObject
    | undefined;
const limitSchema = listParameter("limit")?.schema as JsonObject | undefined;
const offsetSchema = listParameter("offset")?.schema as JsonObject | undefined;
const statusSchema = listParameter("status")?.schema as JsonObject | undefined;
if (
  limitSchema?.default !== 50 ||
  limitSchema.maximum !== 100 ||
  limitSchema.minimum !== 1 ||
  offsetSchema?.default !== 0 ||
  offsetSchema.minimum !== 0 ||
  statusSchema?.default !== "active" ||
  JSON.stringify(statusSchema.enum) !== JSON.stringify(["active", "deleted", "all"])
) {
  throw new Error("GET /v1/managed-profiles must document the controller's pagination and status defaults.");
}

const createCredential = operationAt("/v1/managed-profiles/{profileId}/api-credentials", "post");
const createCredentialResponses = createCredential.responses as JsonObject;
const listCredentialResponses = operationAt("/v1/managed-profiles/{profileId}/api-credentials", "get").responses as JsonObject;
const schemas = ((openapi.components as JsonObject).schemas ?? {}) as JsonObject;
const apiCredentialProperties = ((schemas.ApiCredential as JsonObject).properties ?? {}) as JsonObject;
const createCredentialRequestSchema = schemas.CreateApiCredentialRequest as JsonObject;
const createCredentialRequestProperties = (createCredentialRequestSchema.properties ?? {}) as JsonObject;
const credentialNameSchema = (createCredentialRequestProperties.name ?? {}) as JsonObject;
const createCredentialRequestRequired = Array.isArray(createCredentialRequestSchema.required)
  ? createCredentialRequestSchema.required
  : [];
if (
  JSON.stringify(createCredential.requestBody).includes("#/components/schemas/CreateApiCredentialRequest") === false ||
  JSON.stringify(createCredentialResponses["201"]).includes("#/components/schemas/CreateApiCredentialResponse") === false ||
  JSON.stringify(listCredentialResponses["200"]).includes("#/components/schemas/ListApiCredentialsResponse") === false ||
  "default" in credentialNameSchema ||
  createCredentialRequestRequired.includes("name") ||
  "secretKey" in apiCredentialProperties ||
  JSON.stringify(schemas.CreateApiCredentialResponse).includes('"secretKey":') === false
) {
  throw new Error(
    "Managed-profile credential operations must document optional names, create-once secrets, and secret-free list schemas."
  );
}

const managedProfileHeaderRef = "#/components/parameters/ManagedProfileId";
if (!pointerExists(openapi, managedProfileHeaderRef)) {
  throw new Error(`OpenAPI file is missing reusable managed-profile header: ${managedProfileHeaderRef}`);
}
for (const [path, method] of DELEGATED_OPERATIONS) {
  const parameters = operationAt(path, method).parameters;
  if (
    !Array.isArray(parameters) ||
    !parameters.some(parameter =>
      Boolean(parameter && typeof parameter === "object" && (parameter as JsonObject).$ref === managedProfileHeaderRef)
    )
  ) {
    throw new Error(`${method.toUpperCase()} ${path} must reference ${managedProfileHeaderRef}.`);
  }
}

for (const [path, method] of MANAGED_SELECTOR_SECURITY_OPERATIONS) {
  const operation = operationAt(path, method);
  const actualSecurity = Array.isArray(operation.security)
    ? operation.security.map(requirement => JSON.stringify(requirement)).sort()
    : [];
  const expectedSecurity = MANAGED_PROFILE_SECURITY.map(requirement => JSON.stringify(requirement)).sort();
  if (JSON.stringify(actualSecurity) !== JSON.stringify(expectedSecurity)) {
    throw new Error(`${method.toUpperCase()} ${path} must allow exactly secret-key or Bearer authentication alternatives.`);
  }
}

for (const [path, method] of DELEGATED_OPERATIONS) {
  const responses = operationAt(path, method).responses as JsonObject;
  for (const status of ["400", "401", "403"]) {
    if (!(status in responses)) {
      throw new Error(`${method.toUpperCase()} ${path} must document managed-selector ${status} responses.`);
    }
    if (!transitivelyReferences(responses[status], "#/components/schemas/ManagedSelectorErrorResponse")) {
      throw new Error(`${method.toUpperCase()} ${path} ${status} must include the structured managed-selector error body.`);
    }
  }
}

for (const [path, method] of ALFREDPAY_OPERATIONS) {
  const responses = operationAt(path, method).responses as JsonObject;
  if (JSON.stringify(responses["400"]).includes("Alfredpay") === false) {
    throw new Error(`${method.toUpperCase()} ${path} must preserve the controller's flat Alfredpay 400 error shape.`);
  }
}
for (const [path, method] of DELEGATED_OPERATIONS.filter(([path]) => path.startsWith("/v1/brla/"))) {
  const responses = operationAt(path, method).responses as JsonObject;
  if (!transitivelyReferences(responses["400"], "#/components/schemas/BrlaErrorResponse")) {
    throw new Error(`${method.toUpperCase()} ${path} must preserve the controller's flat BRLA 400 error shape.`);
  }
}
for (const [path, method, status, controllerSchema] of [
  ["/v1/limits", "post", "400", "#/components/schemas/FlatErrorResponse"],
  ["/v1/limits", "post", "403", "#/components/schemas/FlatErrorResponse"],
  ["/v1/quotes", "post", "400", "#/components/schemas/ErrorResponse"],
  ["/v1/quotes/best", "post", "400", "#/components/schemas/ErrorResponse"],
  ["/v1/ramp-info", "get", "400", "#/components/schemas/ApiCredentialErrorResponse"],
  ["/v1/ramp-info", "get", "401", "#/components/schemas/ApiCredentialErrorResponse"],
  ["/v1/ramp-info", "get", "403", "#/components/schemas/ApiCredentialErrorResponse"],
  ["/v1/ramp/{id}", "get", "401", "#/components/schemas/ErrorResponse"],
  ["/v1/ramp/{id}", "get", "403", "#/components/schemas/ErrorResponse"],
  ["/v1/ramp/{id}/errors", "get", "401", "#/components/schemas/ErrorResponse"],
  ["/v1/ramp/{id}/errors", "get", "403", "#/components/schemas/ErrorResponse"],
  ["/v1/ramp/register", "post", "400", "#/components/schemas/ErrorResponse"],
  ["/v1/ramp/start", "post", "400", "#/components/schemas/ErrorResponse"],
  ["/v1/ramp/update", "post", "400", "#/components/schemas/ErrorResponse"]
] as const) {
  const responses = operationAt(path, method).responses as JsonObject;
  if (!transitivelyReferences(responses[status], controllerSchema)) {
    throw new Error(`${method.toUpperCase()} ${path} ${status} must preserve its operation-specific controller error shape.`);
  }
}
if (
  JSON.stringify(schemas.AlfredpayManagedBadRequestResponse).includes("#/components/schemas/ManagedSelectorErrorResponse") ===
    false ||
  JSON.stringify(schemas.BrlaManagedBadRequestResponse).includes("#/components/schemas/ManagedSelectorErrorResponse") === false
) {
  throw new Error("Managed-selector 400 unions must preserve the structured middleware error body.");
}

for (const path of ["/v1/alfredpay/createBusinessCustomer", "/v1/alfredpay/createIndividualCustomer"]) {
  const responses = operationAt(path, "post").responses as JsonObject;
  if (JSON.stringify(responses["502"]).includes("#/components/schemas/AlfredpayErrorResponse") === false) {
    throw new Error(`POST ${path} must document the invalid-upstream-customer 502 response.`);
  }
}

const onboardingStatus = operationAt("/v1/onboarding/status", "get");
const onboardingResponses = onboardingStatus.responses as JsonObject;
if (JSON.stringify(onboardingResponses["200"]).includes("#/components/schemas/OnboardingStatusResponse") === false) {
  throw new Error("GET /v1/onboarding/status must document the aggregate onboarding response schema.");
}
if (
  JSON.stringify(onboardingResponses["401"]).includes("#/components/responses/ManagedSelectorUnauthorized") === false ||
  JSON.stringify(onboardingResponses["500"]).includes("#/components/schemas/OnboardingStatusErrorResponse") === false
) {
  throw new Error("GET /v1/onboarding/status must document its structured 401 and 500 error bodies.");
}

const alfredpayFiatAccountRequest = schemas.AlfredpayAddFiatAccountRequest as JsonObject;
if (
  "default" in (((alfredpayFiatAccountRequest.properties as JsonObject).isExternal as JsonObject) ?? {}) ||
  (alfredpayFiatAccountRequest.required as unknown[]).includes("isExternal")
) {
  throw new Error("AlfredpayAddFiatAccountRequest.isExternal must remain optional without an OpenAPI default.");
}

const kycInformationRequest = schemas.AlfredpaySubmitKycInformationRequest as JsonObject;
const kybInformationRequest = schemas.AlfredpaySubmitKybInformationRequest as JsonObject;
if (
  !JSON.stringify(kycInformationRequest.allOf).includes('"const":"AR"') ||
  !JSON.stringify(kycInformationRequest.allOf).includes('"pattern":"^\\\\+54"') ||
  !JSON.stringify(kycInformationRequest.allOf).includes('"pattern":"^\\\\d{11}$"') ||
  !JSON.stringify(kycInformationRequest.allOf).includes('"pattern":"^[A-Z]{2}$"') ||
  !JSON.stringify(kycInformationRequest.allOf).includes('"required":["phoneNumber","pep"]')
) {
  throw new Error(
    "AlfredpaySubmitKycInformationRequest must document Argentina phone, CUIT, nationality, and PEP requirements."
  );
}
const kybProperties = kybInformationRequest.properties as JsonObject;
if (
  !JSON.stringify(kybInformationRequest.allOf).includes('"required":["conductsComplianceScreening"]') ||
  !JSON.stringify(kybInformationRequest.allOf).includes('"required":["complianceScreeningDescription"]') ||
  !JSON.stringify(kybInformationRequest.allOf).includes('"complianceScreeningDescription":{"minLength":1') ||
  ["walletAddresses", "sourceOfFunds", "businessActivities", "accountPurpose"].some(
    property => (kybProperties[property] as JsonObject).minLength !== 1
  )
) {
  throw new Error(
    "AlfredpaySubmitKybInformationRequest must document nonblank questionnaire and conditional screening requirements."
  );
}

const recordAttempt = operationAt("/v1/brla/kyc/record-attempt", "post");
const recordAttemptSchemaRef = (
  ((recordAttempt.requestBody as JsonObject).content as JsonObject)["application/json"] as JsonObject
).schema as JsonObject;
if (recordAttemptSchemaRef.$ref !== "#/components/schemas/RecordInitialKycAttemptRequest") {
  throw new Error("POST /v1/brla/kyc/record-attempt must reference the RecordInitialKycAttemptRequest schema.");
}
const recordAttemptRequired = (schemas.RecordInitialKycAttemptRequest as JsonObject).required as unknown[];
if (!recordAttemptRequired.includes("quoteId") || !recordAttemptRequired.includes("taxId")) {
  throw new Error("POST /v1/brla/kyc/record-attempt must require the shared quoteId and taxId request fields.");
}

function queryParameter(path: string, name: string): JsonObject | undefined {
  const parameters = operationAt(path, "get").parameters;
  if (!Array.isArray(parameters)) return undefined;
  return parameters.find(
    parameter =>
      parameter &&
      typeof parameter === "object" &&
      (parameter as JsonObject).in === "query" &&
      (parameter as JsonObject).name === name
  ) as JsonObject | undefined;
}

const getUserTaxId = queryParameter("/v1/brla/getUser", "taxId");
const remainingLimitTaxId = queryParameter("/v1/brla/getUserRemainingLimit", "taxId");
const remainingLimitDirection = queryParameter("/v1/brla/getUserRemainingLimit", "direction");
if (
  !getUserTaxId ||
  getUserTaxId.required !== false ||
  getUserTaxId.deprecated !== true ||
  !remainingLimitTaxId ||
  remainingLimitTaxId.required !== false ||
  remainingLimitTaxId.deprecated !== true ||
  !remainingLimitDirection ||
  remainingLimitDirection.required !== true ||
  JSON.stringify(remainingLimitDirection.schema).includes("#/components/schemas/RampDirection") === false
) {
  throw new Error(
    "BRLA account reads must document optional deprecated taxId and a required RampDirection for remaining limits."
  );
}

for (const [path, method] of [
  ["/v1/webhook", "post"],
  ["/v1/webhook/{id}", "delete"]
] as const) {
  const operation = operationAt(path, method);
  if (JSON.stringify(operation.security) !== JSON.stringify([{ SecretApiKey: [] }])) {
    throw new Error(`${method.toUpperCase()} ${path} must require only secret API-key authentication.`);
  }
  const responses = operation.responses as JsonObject;
  if (
    !transitivelyReferences(responses["400"], "#/components/schemas/ManagedSelectorErrorResponse") ||
    !transitivelyReferences(responses["401"], "#/components/schemas/ApiCredentialErrorResponse") ||
    !transitivelyReferences(responses["403"], "#/components/schemas/ManagedSelectorErrorResponse")
  ) {
    throw new Error(`${method.toUpperCase()} ${path} must document managed-profile 400/403 and secret-key 401 errors.`);
  }
  if (!String(operation.description).includes("Managed profiles are polling-only")) {
    throw new Error(`${method.toUpperCase()} ${path} must document the managed-profile polling-only contract.`);
  }
}
for (const path of ["/v1/alfredpay/submitKycFile", "/v1/alfredpay/submitKybFile", "/v1/alfredpay/submitKybRelatedPersonFile"]) {
  const requestBody = operationAt(path, "post").requestBody;
  if (!JSON.stringify(requestBody).includes('"multipart/form-data"')) {
    throw new Error(`POST ${path} must document its multipart upload body.`);
  }
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
    if ("fields" in requirements) {
      throw new Error("Onboarding discovery must not duplicate request fields outside OpenAPI.");
    }
    if (requirements.steps.some(step => step.method === "GET")) {
      throw new Error("Onboarding discovery must not advertise GET operations.");
    }
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

await checkGeneratedTypes();

const manifest = readJson(MANIFEST_FILE);
const endpointReference = manifest.endpointReference as JsonObject | undefined;
const manifestPaths = endpointReference?.currentDocumentedPaths;
if (!Array.isArray(manifestPaths) || JSON.stringify([...manifestPaths].sort()) !== JSON.stringify([...paths].sort())) {
  throw new Error(`${MANIFEST_FILE} currentDocumentedPaths must exactly match the OpenAPI path catalog.`);
}
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
