import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ONBOARDING_REQUIREMENTS } from "../../../packages/shared/src/endpoints/onboarding-requirements.endpoints";

const OPENAPI_FILE = "docs/api/openapi/vortex.openapi.json";
const GENERATED_TYPES_FILE = "docs/api/openapi/vortex.openapi.d.ts";
const GENERATOR_FILE = "docs/api/scripts/generate-openapi-types.ts";
const MANIFEST_FILE = "docs/api/apidog/page-manifest.json";

const REQUIRED_PATHS = [
  "/v1/api-credentials",
  "/v1/api-credentials/{credentialId}",
  "/v1/domestic/alfredpayStatus",
  "/v1/domestic/createBusinessCustomer",
  "/v1/domestic/createIndividualCustomer",
  "/v1/domestic/fiatAccounts",
  "/v1/domestic/fiatAccounts/{fiatAccountId}",
  "/v1/domestic/findKybCustomerAndBusiness",
  "/v1/domestic/getKybRedirectLink",
  "/v1/domestic/getKycRedirectLink",
  "/v1/domestic/getKycStatus",
  "/v1/domestic/kycRedirectFinished",
  "/v1/domestic/kycRedirectOpened",
  "/v1/domestic/retryKyc",
  "/v1/domestic/sendKybSubmission",
  "/v1/domestic/sendKycSubmission",
  "/v1/domestic/submitKybFile",
  "/v1/domestic/submitKybInformation",
  "/v1/domestic/submitKybRelatedPersonFile",
  "/v1/domestic/submitKycFile",
  "/v1/domestic/submitKycInformation",
  "/v1/brl/createSubaccount",
  "/v1/brl/getKycStatus",
  "/v1/brl/getSelfieLivenessUrl",
  "/v1/brl/getUploadUrls",
  "/v1/brl/getUser",
  "/v1/brl/getUserRemainingLimit",
  "/v1/brl/kyb/attempt-status",
  "/v1/brl/kyb/documents",
  "/v1/brl/kyb/documents/{documentId}",
  "/v1/brl/kyb/new-level-1/api",
  "/v1/brl/kyb/new-level-1/web-sdk",
  "/v1/brl/kyb/ubos",
  "/v1/brl/kyc/import-token",
  "/v1/brl/kyc/record-attempt",
  "/v1/brl/newKyc",
  "/v1/brl/validatePixKey",
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

const BRLA_RECONCILIATION_OPERATIONS = [
  ["/v1/brl/getKycStatus", "get"],
  ["/v1/brl/getSelfieLivenessUrl", "get"],
  ["/v1/brl/getUploadUrls", "post"],
  ["/v1/brl/newKyc", "post"]
] as const;

const BRLA_IMPORT_KYC_TOKEN_ERRORS = [
  "Idempotency-Key must contain 1 to 128 visible ASCII characters",
  "Invalid request body",
  "importToken must contain between 1 and 1024 bytes",
  "consentAttested must be true",
  "The subject profile has no active customer entity",
  "The managed subject does not match the expected customer entity",
  "A managed profile requires a managed customer entity context",
  "The subject customer entity is not active",
  "Token import is only available for individuals",
  "Exactly one active Brazilian individual customer is required",
  "Multiple customers require reconciliation",
  "The BR subaccount is not provisioned",
  "The customer is already approved",
  "The canonical KYC case is missing",
  "Multiple KYC cases require reconciliation",
  "The KYC case is already approved",
  "The confirmed token import is missing its provider attempt",
  "The idempotency key was used with a different token",
  "The token import does not match this request",
  "A failed token import requires a new idempotency key",
  "The KYC is already approved",
  "The previous token import outcome requires reconciliation",
  "Another token import requires reconciliation",
  "This KYC case uses the standard verification method",
  "The token import attempt is invalid",
  "The token import attempt requires reconciliation",
  "The token import was already claimed",
  "The token import binding is no longer current",
  "The authenticated profile cannot perform this operation for the requested managed profile",
  "Token import pre-provider checks failed",
  "Token import is not enabled",
  "The token import outcome requires reconciliation",
  "Token import failed"
] as const;

const MANAGED_PROFILE_PATHS = [
  "/v1/managed-profiles",
  "/v1/managed-profiles/{profileId}",
  "/v1/managed-profiles/{profileId}/api-credentials",
  "/v1/managed-profiles/{profileId}/api-credentials/{credentialId}"
] as const;

const ALFREDPAY_OPERATIONS = [
  ["/v1/domestic/alfredpayStatus", "get"],
  ["/v1/domestic/createBusinessCustomer", "post"],
  ["/v1/domestic/createIndividualCustomer", "post"],
  ["/v1/domestic/fiatAccounts", "get"],
  ["/v1/domestic/fiatAccounts", "post"],
  ["/v1/domestic/fiatAccounts/{fiatAccountId}", "delete"],
  ["/v1/domestic/findKybCustomerAndBusiness", "get"],
  ["/v1/domestic/getKybRedirectLink", "get"],
  ["/v1/domestic/getKycRedirectLink", "get"],
  ["/v1/domestic/getKycStatus", "get"],
  ["/v1/domestic/kycRedirectFinished", "post"],
  ["/v1/domestic/kycRedirectOpened", "post"],
  ["/v1/domestic/retryKyc", "post"],
  ["/v1/domestic/sendKybSubmission", "post"],
  ["/v1/domestic/sendKycSubmission", "post"],
  ["/v1/domestic/submitKybFile", "post"],
  ["/v1/domestic/submitKybInformation", "post"],
  ["/v1/domestic/submitKybRelatedPersonFile", "post"],
  ["/v1/domestic/submitKycFile", "post"],
  ["/v1/domestic/submitKycInformation", "post"]
] as const;

const MANAGED_SELECTOR_SECURITY_OPERATIONS = [
  ...ALFREDPAY_OPERATIONS,
  ["/v1/brl/createSubaccount", "post"],
  ["/v1/brl/getKycStatus", "get"],
  ["/v1/brl/getSelfieLivenessUrl", "get"],
  ["/v1/brl/getUploadUrls", "post"],
  ["/v1/brl/kyb/attempt-status", "get"],
  ["/v1/brl/kyb/documents", "post"],
  ["/v1/brl/kyb/documents/{documentId}", "get"],
  ["/v1/brl/kyb/new-level-1/api", "post"],
  ["/v1/brl/kyb/new-level-1/web-sdk", "post"],
  ["/v1/brl/kyb/ubos", "post"],
  ["/v1/brl/kyc/import-token", "post"],
  ["/v1/brl/kyc/record-attempt", "post"],
  ["/v1/brl/newKyc", "post"],
  ["/v1/onboarding/status", "get"]
] as const;

const DELEGATED_OPERATIONS = [
  ["/v1/domestic/alfredpayStatus", "get"],
  ["/v1/domestic/createBusinessCustomer", "post"],
  ["/v1/domestic/createIndividualCustomer", "post"],
  ["/v1/domestic/fiatAccounts", "get"],
  ["/v1/domestic/fiatAccounts", "post"],
  ["/v1/domestic/fiatAccounts/{fiatAccountId}", "delete"],
  ["/v1/domestic/findKybCustomerAndBusiness", "get"],
  ["/v1/domestic/getKybRedirectLink", "get"],
  ["/v1/domestic/getKycRedirectLink", "get"],
  ["/v1/domestic/getKycStatus", "get"],
  ["/v1/domestic/kycRedirectFinished", "post"],
  ["/v1/domestic/kycRedirectOpened", "post"],
  ["/v1/domestic/retryKyc", "post"],
  ["/v1/domestic/sendKybSubmission", "post"],
  ["/v1/domestic/sendKycSubmission", "post"],
  ["/v1/domestic/submitKybFile", "post"],
  ["/v1/domestic/submitKybInformation", "post"],
  ["/v1/domestic/submitKybRelatedPersonFile", "post"],
  ["/v1/domestic/submitKycFile", "post"],
  ["/v1/domestic/submitKycInformation", "post"],
  ["/v1/brl/createSubaccount", "post"],
  ["/v1/brl/getKycStatus", "get"],
  ["/v1/brl/getSelfieLivenessUrl", "get"],
  ["/v1/brl/getUploadUrls", "post"],
  ["/v1/brl/getUser", "get"],
  ["/v1/brl/getUserRemainingLimit", "get"],
  ["/v1/brl/kyb/attempt-status", "get"],
  ["/v1/brl/kyb/documents", "post"],
  ["/v1/brl/kyb/documents/{documentId}", "get"],
  ["/v1/brl/kyb/new-level-1/api", "post"],
  ["/v1/brl/kyb/new-level-1/web-sdk", "post"],
  ["/v1/brl/kyb/ubos", "post"],
  ["/v1/brl/kyc/record-attempt", "post"],
  ["/v1/brl/newKyc", "post"],
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

function schemaHasProperty(schema: unknown, property: string, seen = new Set<string>()): boolean {
  if (!schema || typeof schema !== "object") return false;

  const schemaObject = schema as JsonObject;
  const ref = schemaObject.$ref;
  if (typeof ref === "string" && !seen.has(ref)) {
    seen.add(ref);
    if (schemaHasProperty(valueAtPointer(openapi, ref), property, seen)) return true;
  }

  const properties = schemaObject.properties;
  if (properties && typeof properties === "object" && property in properties) return true;

  for (const composition of [schemaObject.allOf, schemaObject.anyOf, schemaObject.oneOf]) {
    if (Array.isArray(composition) && composition.some(part => schemaHasProperty(part, property, seen))) return true;
  }

  return false;
}

function operationHasQueryParameter(operation: JsonObject, name: string): boolean {
  const parameters = operation.parameters;
  if (!Array.isArray(parameters)) return false;

  return parameters.some(parameter => {
    const resolved =
      parameter && typeof parameter === "object" && typeof (parameter as JsonObject).$ref === "string"
        ? valueAtPointer(openapi, (parameter as JsonObject).$ref as string)
        : parameter;
    return Boolean(
      resolved &&
        typeof resolved === "object" &&
        (resolved as JsonObject).in === "query" &&
        (resolved as JsonObject).name === name
    );
  });
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
  .filter(path => path.startsWith("/v1/domestic/"))
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
const schemas = ((openapi.components as JsonObject).schemas ?? {}) as JsonObject;
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
const listManagedProfilesResponseSchema = schemas.ListManagedProfilesResponse as JsonObject;
const listManagedProfilesResponseProperties = (listManagedProfilesResponseSchema.properties ?? {}) as JsonObject;
const listManagedProfilesResponseRequired = Array.isArray(listManagedProfilesResponseSchema.required)
  ? listManagedProfilesResponseSchema.required
  : [];
const managerPolicySchema = schemas.ManagedProfileManagerPolicy as JsonObject;
const managerPolicyProperties = (managerPolicySchema.properties ?? {}) as JsonObject;
const managerPolicyRequired = Array.isArray(managerPolicySchema.required) ? managerPolicySchema.required : [];
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
if (
  JSON.stringify(listManagedProfilesResponseProperties.manager) !==
    JSON.stringify({ $ref: "#/components/schemas/ManagedProfileManagerPolicy" }) ||
  !listManagedProfilesResponseRequired.includes("manager") ||
  JSON.stringify(managerPolicyRequired.sort()) !==
    JSON.stringify(["allowedCorridors", "allowedCustomerTypes", "profileId"].sort()) ||
  JSON.stringify((managerPolicyProperties.profileId as JsonObject)?.format) !== JSON.stringify("uuid") ||
  JSON.stringify(((managerPolicyProperties.allowedCorridors as JsonObject)?.items as JsonObject)?.enum) !==
    JSON.stringify(["AR", "BR", "CO", "EU", "MX", "US"]) ||
  JSON.stringify((managerPolicyProperties.allowedCustomerTypes as JsonObject)?.type) !== JSON.stringify(["array", "null"]) ||
  JSON.stringify(((managerPolicyProperties.allowedCustomerTypes as JsonObject)?.items as JsonObject)?.enum) !==
    JSON.stringify(["individual", "business"])
) {
  throw new Error("GET /v1/managed-profiles must return the required manager-scoped policy contract.");
}

const createCredential = operationAt("/v1/managed-profiles/{profileId}/api-credentials", "post");
const createCredentialResponses = createCredential.responses as JsonObject;
const listCredentialResponses = operationAt("/v1/managed-profiles/{profileId}/api-credentials", "get").responses as JsonObject;
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

const updateRampAdditionalData = ((schemas.UpdateRampRequest as JsonObject).properties as JsonObject)
  .additionalData as JsonObject;
const updateRampAdditionalDataProperties = (updateRampAdditionalData.properties ?? {}) as JsonObject;
const expectedUpdateRampAdditionalDataFields = [
  "assethubToPendulumHash",
  "squidRouterApproveHash",
  "squidRouterNoPermitApproveHash",
  "squidRouterNoPermitSwapHash",
  "squidRouterNoPermitTransferHash",
  "squidRouterSwapHash"
];
if (
  updateRampAdditionalData.additionalProperties !== false ||
  JSON.stringify(Object.keys(updateRampAdditionalDataProperties).sort()) !==
    JSON.stringify(expectedUpdateRampAdditionalDataFields.sort())
) {
  throw new Error("UpdateRampRequest.additionalData must exactly match the runtime client-writable hash allowlist.");
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
  if (JSON.stringify(responses["400"]).includes("Domestic") === false) {
    throw new Error(`${method.toUpperCase()} ${path} must preserve the controller's flat domestic-corridor 400 error shape.`);
  }
}
for (const [path, method] of DELEGATED_OPERATIONS.filter(([path]) => path.startsWith("/v1/brl/"))) {
  const responses = operationAt(path, method).responses as JsonObject;
  if (!transitivelyReferences(responses["400"], "#/components/schemas/BrErrorResponse")) {
    throw new Error(`${method.toUpperCase()} ${path} must preserve the controller's flat BRLA 400 error shape.`);
  }
}
for (const [path, method] of BRLA_RECONCILIATION_OPERATIONS) {
  const responses = operationAt(path, method).responses as JsonObject;
  for (const status of ["409", "502"]) {
    if (!transitivelyReferences(responses[status], "#/components/schemas/BrErrorResponse")) {
      throw new Error(`${method.toUpperCase()} ${path} ${status} must preserve the flat BRLA reconciliation error shape.`);
    }
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
  JSON.stringify(schemas.DomesticManagedBadRequestResponse).includes("#/components/schemas/ManagedSelectorErrorResponse") ===
    false ||
  JSON.stringify(schemas.BrManagedBadRequestResponse).includes("#/components/schemas/ManagedSelectorErrorResponse") === false
) {
  throw new Error("Managed-selector 400 unions must preserve the structured middleware error body.");
}

for (const path of ["/v1/domestic/createBusinessCustomer", "/v1/domestic/createIndividualCustomer"]) {
  const responses = operationAt(path, "post").responses as JsonObject;
  if (JSON.stringify(responses["502"]).includes("#/components/schemas/DomesticErrorResponse") === false) {
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

const alfredpayFiatAccountRequest = schemas.DomesticAddFiatAccountRequest as JsonObject;
if (
  "default" in (((alfredpayFiatAccountRequest.properties as JsonObject).isExternal as JsonObject) ?? {}) ||
  (alfredpayFiatAccountRequest.required as unknown[]).includes("isExternal")
) {
  throw new Error("DomesticAddFiatAccountRequest.isExternal must remain optional without an OpenAPI default.");
}

const kycInformationRequest = schemas.DomesticSubmitKycInformationRequest as JsonObject;
const kybInformationRequest = schemas.DomesticSubmitKybInformationRequest as JsonObject;
if (
  !JSON.stringify(kycInformationRequest.allOf).includes('"const":"AR"') ||
  !JSON.stringify(kycInformationRequest.allOf).includes('"pattern":"^\\\\+54"') ||
  !JSON.stringify(kycInformationRequest.allOf).includes('"pattern":"^\\\\d{11}$"') ||
  !JSON.stringify(kycInformationRequest.allOf).includes('"pattern":"^[A-Z]{2}$"') ||
  !JSON.stringify(kycInformationRequest.allOf).includes('"required":["phoneNumber","pep"]')
) {
  throw new Error(
    "DomesticSubmitKycInformationRequest must document Argentina phone, CUIT, nationality, and PEP requirements."
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
    "DomesticSubmitKybInformationRequest must document nonblank questionnaire and conditional screening requirements."
  );
}

const recordAttempt = operationAt("/v1/brl/kyc/record-attempt", "post");
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

const importKycToken = operationAt("/v1/brl/kyc/import-token", "post");
const importKycTokenParameters = importKycToken.parameters as JsonObject[];
const importKycTokenIdempotency = importKycTokenParameters.find(parameter => parameter.name === "Idempotency-Key");
const importKycTokenManagedSelector = importKycTokenParameters.find(parameter => parameter.$ref === managedProfileHeaderRef);
const importKycTokenRequest = schemas.BrImportKycTokenRequest as JsonObject;
const importKycTokenRequestProperties = importKycTokenRequest.properties as JsonObject;
const importKycTokenResponses = importKycToken.responses as JsonObject;
const importKycTokenDescription = String(importKycToken.description);
const importKycTokenError = ((schemas.BrImportKycTokenErrorResponse as JsonObject).properties as JsonObject)
  .error as JsonObject;
const malformedJsonError = schemas.MalformedJsonErrorResponse as JsonObject;
const payloadTooLargeError = schemas.PayloadTooLargeErrorResponse as JsonObject;
if (
  JSON.stringify(importKycToken.security) !== JSON.stringify([{ SecretApiKey: [] }, { BearerAuth: [] }]) ||
  !importKycTokenManagedSelector ||
  importKycTokenIdempotency?.in !== "header" ||
  importKycTokenIdempotency.required !== true ||
  (importKycTokenIdempotency.schema as JsonObject)?.pattern !== "^[!-~]+$" ||
  importKycTokenRequest.additionalProperties !== false ||
  JSON.stringify(Object.keys(importKycTokenRequestProperties).sort()) !== JSON.stringify(["consentAttested", "importToken"]) ||
  JSON.stringify((importKycTokenRequest.required as string[]).sort()) !== JSON.stringify(["consentAttested", "importToken"]) ||
  (importKycTokenRequestProperties.consentAttested as JsonObject).const !== true ||
  (importKycTokenRequestProperties.importToken as JsonObject)["x-maxBytes"] !== 1024 ||
  "maxLength" in (importKycTokenRequestProperties.importToken as JsonObject) ||
  JSON.stringify(Object.keys(importKycTokenResponses).sort()) !==
    JSON.stringify(["202", "400", "401", "403", "409", "412", "413", "500", "502", "503"]) ||
  !transitivelyReferences(importKycTokenResponses["202"], "#/components/schemas/BrImportKycTokenResponse") ||
  !transitivelyReferences(importKycTokenResponses["400"], "#/components/schemas/ManagedSelectorErrorResponse") ||
  !transitivelyReferences(importKycTokenResponses["400"], "#/components/schemas/MalformedJsonErrorResponse") ||
  !transitivelyReferences(importKycTokenResponses["401"], "#/components/schemas/ManagedSelectorErrorResponse") ||
  !transitivelyReferences(importKycTokenResponses["403"], "#/components/schemas/ManagedSelectorErrorResponse") ||
  !transitivelyReferences(importKycTokenResponses["403"], "#/components/schemas/BrImportKycTokenErrorResponse") ||
  !transitivelyReferences(importKycTokenResponses["409"], "#/components/schemas/BrImportKycTokenErrorResponse") ||
  !transitivelyReferences(importKycTokenResponses["412"], "#/components/schemas/BrImportKycTokenErrorResponse") ||
  !transitivelyReferences(importKycTokenResponses["413"], "#/components/schemas/PayloadTooLargeErrorResponse") ||
  !transitivelyReferences(importKycTokenResponses["500"], "#/components/schemas/BrImportKycTokenErrorResponse") ||
  !transitivelyReferences(importKycTokenResponses["500"], "#/components/schemas/ErrorResponse") ||
  !transitivelyReferences(importKycTokenResponses["502"], "#/components/schemas/BrImportKycTokenErrorResponse") ||
  JSON.stringify(importKycTokenError.enum) !== JSON.stringify(BRLA_IMPORT_KYC_TOKEN_ERRORS) ||
  JSON.stringify(malformedJsonError.required) !== JSON.stringify(["code", "message", "statusCode", "type"]) ||
  ((malformedJsonError.properties as JsonObject).code as JsonObject).const !== 400 ||
  ((malformedJsonError.properties as JsonObject).message as JsonObject).const !== "Invalid JSON payload" ||
  ((malformedJsonError.properties as JsonObject).statusCode as JsonObject).const !== 400 ||
  ((malformedJsonError.properties as JsonObject).type as JsonObject).const !== "entity.parse.failed" ||
  JSON.stringify(payloadTooLargeError.required) !== JSON.stringify(["code", "message", "statusCode", "type"]) ||
  ((payloadTooLargeError.properties as JsonObject).code as JsonObject).const !== 413 ||
  ((payloadTooLargeError.properties as JsonObject).message as JsonObject).const !== "Request body too large" ||
  ((payloadTooLargeError.properties as JsonObject).statusCode as JsonObject).const !== 413 ||
  ((payloadTooLargeError.properties as JsonObject).type as JsonObject).const !== "entity.too.large"
) {
  throw new Error(
    "POST /v1/brla/kyc/import-token must preserve its strict body, idempotency, auth, and stable response contract."
  );
}
for (const requiredStatement of [
  "Authentication and profile-bound principal enforcement run before managed-profile authorization and strict body validation",
  "direct managed-child credentials are rejected",
  "sumsub-share-v1",
  "Import the token before reading KYC or onboarding status",
  "preserving prior attestations",
  "safely reconciles a durable submitted/ambiguous claim",
  "provider `401`",
  "Every other post-send",
  "never replayed automatically",
  "exact returned provider attempt",
  "`EXPIRED` remains non-approved and locally pending for reconciliation",
  "external status is retained",
  "notification-only",
  "no live sandbox verification is claimed"
]) {
  if (!importKycTokenDescription.includes(requiredStatement)) {
    throw new Error(`POST /v1/brla/kyc/import-token must document: ${requiredStatement}`);
  }
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

const getUserTaxId = queryParameter("/v1/brl/getUser", "taxId");
const remainingLimitTaxId = queryParameter("/v1/brl/getUserRemainingLimit", "taxId");
const remainingLimitDirection = queryParameter("/v1/brl/getUserRemainingLimit", "direction");
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
for (const path of ["/v1/domestic/submitKycFile", "/v1/domestic/submitKybFile", "/v1/domestic/submitKybRelatedPersonFile"]) {
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
      for (const field of Object.keys(step.fixedBody ?? {})) {
        if (!step.requestSchema || !schemaHasProperty(valueAtPointer(openapi, step.requestSchema), field)) {
          throw new Error(`Onboarding discovery operation ${step.operationId} fixes unknown body field: ${field}`);
        }
      }
      for (const field of Object.keys(step.fixedQuery ?? {})) {
        if (!operationHasQueryParameter(operationAt(step.path, step.method.toLowerCase()), field)) {
          throw new Error(`Onboarding discovery operation ${step.operationId} fixes unknown query field: ${field}`);
        }
      }
      for (const target of Object.keys(step.derivedValues ?? {})) {
        const [location, field, ...rest] = target.split(".");
        const validBodyTarget =
          location === "body" &&
          rest.length === 0 &&
          step.requestSchema &&
          schemaHasProperty(valueAtPointer(openapi, step.requestSchema), field);
        const validQueryTarget =
          location === "query" &&
          rest.length === 0 &&
          operationHasQueryParameter(operationAt(step.path, step.method.toLowerCase()), field);
        if (!validBodyTarget && !validQueryTarget) {
          throw new Error(`Onboarding discovery operation ${step.operationId} derives unknown request target: ${target}`);
        }
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
