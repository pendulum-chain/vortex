import type { CorridorCustomerType } from "../corridors";

export type OnboardingRequirementsCountry = "AR" | "BR" | "CO" | "MX" | "US";
export type OnboardingFlowMode = "api" | "hosted" | "hybrid";
export type OnboardingRequirementFieldType = "array" | "boolean" | "number" | "string";
export type OnboardingStepKind = "api" | "direct-upload" | "hosted";

export interface OnboardingRequirementField {
  path: string;
  required: boolean;
  type: OnboardingRequirementFieldType;
  allowedValues?: string[];
  description?: string;
  format?: string;
  requiredWhen?: string;
}

export interface OnboardingDocumentRequirement {
  type: string;
  required: boolean;
  acceptedMediaTypes?: string[];
  collection?: "direct-upload" | "hosted";
  description?: string;
  requiredWhen?: string;
}

export interface OnboardingRequirementStep {
  order: number;
  kind: OnboardingStepKind;
  description: string;
  operationId?: string;
  method?: "GET" | "POST" | "PUT";
  path?: string;
  requestSchema?: string;
  condition?: string;
  derivedValues?: Record<string, string>;
  fixedBody?: Record<string, string>;
  fixedQuery?: Record<string, string>;
  repeatFor?: string;
}

export interface GetOnboardingRequirementsResponse {
  country: OnboardingRequirementsCountry;
  customerType: CorridorCustomerType;
  documentationUrl: string;
  fields: OnboardingRequirementField[];
  flow: string;
  mode: OnboardingFlowMode;
  openapiUrl: string;
  provider: "alfredpay" | "avenia";
  requirementsVersion: string;
  documents: OnboardingDocumentRequirement[];
  steps: OnboardingRequirementStep[];
}

export interface GetOnboardingRequirementsErrorResponse {
  error: {
    code: "INVALID_ONBOARDING_REQUIREMENTS_QUERY" | "ONBOARDING_REQUIREMENTS_NOT_FOUND";
    message: string;
    status: 400 | 404;
  };
}

const REQUIREMENTS_VERSION = "2026-08-10";
const OPENAPI_URL = "https://raw.githubusercontent.com/pendulum-chain/vortex/main/docs/api/openapi/vortex.openapi.json";
const ALFREDPAY_MEDIA_TYPES = ["image/jpeg", "image/png", "application/pdf"];

const alfredpayInitialSteps = (
  country: OnboardingRequirementsCountry,
  customerType: CorridorCustomerType
): OnboardingRequirementStep[] => [
  {
    description: "Read the current provider onboarding state.",
    fixedQuery: { country, type: customerType === "business" ? "BUSINESS" : "INDIVIDUAL" },
    kind: "api",
    method: "GET",
    operationId: "getAlfredpayStatus",
    order: 1,
    path: "/v1/alfredpay/alfredpayStatus"
  },
  {
    condition: "Run only when no provider customer exists.",
    description: `Create the ${customerType} provider customer.`,
    fixedBody: { country },
    kind: "api",
    method: "POST",
    operationId: customerType === "business" ? "createAlfredpayBusinessCustomer" : "createAlfredpayIndividualCustomer",
    order: 2,
    path: customerType === "business" ? "/v1/alfredpay/createBusinessCustomer" : "/v1/alfredpay/createIndividualCustomer",
    requestSchema: "#/components/schemas/AlfredpayCreateCustomerRequest"
  }
];

const alfredpayIndividualFields = (country: "AR" | "CO" | "MX"): OnboardingRequirementField[] => {
  const fields: OnboardingRequirementField[] = [
    { path: "firstName", required: true, type: "string" },
    { path: "lastName", required: true, type: "string" },
    { format: "date", path: "dateOfBirth", required: true, type: "string" },
    { allowedValues: [country], path: "country", required: true, type: "string" },
    { path: "city", required: true, type: "string" },
    { path: "state", required: true, type: "string" },
    { path: "zipCode", required: true, type: "string" },
    { path: "address", required: true, type: "string" },
    { path: "dni", required: true, type: "string" }
  ];

  if (country === "MX") {
    fields.push({ format: "email", path: "email", required: true, type: "string" });
    fields.push({ path: "typeDocument", required: false, type: "string" });
  }
  if (country === "CO") {
    fields.push({ allowedValues: ["CC", "CE"], path: "typeDocumentCol", required: true, type: "string" });
    fields.push({ format: "phone", path: "phoneNumber", required: true, type: "string" });
  }
  if (country === "AR") {
    fields.push(
      { format: "email", path: "email", required: true, type: "string" },
      { format: "phone", path: "phoneNumber", required: true, type: "string" },
      { allowedValues: ["AR"], path: "countryCode", required: true, type: "string" },
      { allowedValues: ["AR"], path: "nationalities", required: true, type: "array" },
      { allowedValues: ["DNI"], path: "typeDocumentAr", required: true, type: "string" },
      { path: "pep", required: true, type: "boolean" },
      { description: "Optional 11-digit CUIT.", path: "cuit", required: false, type: "string" }
    );
  }

  return fields;
};

const alfredpayIndividualDocuments = (includeSelfie: boolean): OnboardingDocumentRequirement[] => [
  { acceptedMediaTypes: ALFREDPAY_MEDIA_TYPES, required: true, type: "National ID Front" },
  { acceptedMediaTypes: ALFREDPAY_MEDIA_TYPES, required: true, type: "National ID Back" },
  ...(includeSelfie ? [{ acceptedMediaTypes: ALFREDPAY_MEDIA_TYPES, required: true, type: "Selfie" }] : [])
];

const alfredpayIndividualFlow = (country: "AR" | "CO" | "MX"): GetOnboardingRequirementsResponse => ({
  country,
  customerType: "individual",
  documentationUrl: "https://api-docs.vortexfinance.co/fiat-corridors",
  documents: alfredpayIndividualDocuments(country === "AR"),
  fields: alfredpayIndividualFields(country),
  flow: `alfredpay-${country.toLowerCase()}-individual-api-kyc`,
  mode: "api",
  openapiUrl: OPENAPI_URL,
  provider: "alfredpay",
  requirementsVersion: REQUIREMENTS_VERSION,
  steps: [
    ...alfredpayInitialSteps(country, "individual"),
    {
      description: "Create the KYC submission with the collected identity data.",
      fixedBody: { country },
      kind: "api",
      method: "POST",
      operationId: "submitAlfredpayKycInformation",
      order: 3,
      path: "/v1/alfredpay/submitKycInformation",
      requestSchema: "#/components/schemas/SubmitKycInformationRequest"
    },
    {
      derivedValues: {
        "body.fileType": "current document type",
        "body.submissionId": "step 3 response submissionId"
      },
      description: "Upload each required identity document.",
      fixedBody: { country },
      kind: "api",
      method: "POST",
      operationId: "submitAlfredpayKycFile",
      order: 4,
      path: "/v1/alfredpay/submitKycFile",
      repeatFor: "documents",
      requestSchema: "#/components/schemas/AlfredpayKycFileUploadRequest"
    },
    {
      derivedValues: { "body.submissionId": "step 3 response submissionId" },
      description: "Finalize the KYC submission.",
      fixedBody: { country },
      kind: "api",
      method: "POST",
      operationId: "sendAlfredpayKycSubmission",
      order: 5,
      path: "/v1/alfredpay/sendKycSubmission",
      requestSchema: "#/components/schemas/AlfredpaySendSubmissionRequest"
    },
    {
      description: "Poll until the provider reports a terminal status.",
      fixedQuery: { country, type: "INDIVIDUAL" },
      kind: "api",
      method: "GET",
      operationId: "getAlfredpayKycStatus",
      order: 6,
      path: "/v1/alfredpay/getKycStatus"
    }
  ]
});

const alfredpayBusinessFields: OnboardingRequirementField[] = [
  { path: "businessName", required: true, type: "string" },
  { path: "taxId", required: true, type: "string" },
  { format: "uri", path: "website", required: true, type: "string" },
  { path: "address", required: true, type: "string" },
  { path: "city", required: true, type: "string" },
  { path: "state", required: true, type: "string" },
  { path: "zipCode", required: true, type: "string" },
  { path: "relatedPersons[].firstName", required: true, type: "string" },
  { path: "relatedPersons[].lastName", required: true, type: "string" },
  { format: "email", path: "relatedPersons[].email", required: true, type: "string" },
  { format: "date", path: "relatedPersons[].dateOfBirth", required: true, type: "string" },
  { path: "relatedPersons[].nationalities", required: true, type: "array" },
  { path: "walletAddresses", required: true, type: "string" },
  { path: "sourceOfFunds", required: true, type: "string" },
  { path: "transmitsCustomerFunds", required: true, type: "boolean" },
  {
    path: "conductsComplianceScreening",
    required: false,
    requiredWhen: "transmitsCustomerFunds is true",
    type: "boolean"
  },
  {
    path: "complianceScreeningDescription",
    required: false,
    requiredWhen: "conductsComplianceScreening is true",
    type: "string"
  },
  { path: "operatesInSanctionedCountries", required: true, type: "boolean" },
  { path: "isRegulatedBusiness", required: true, type: "boolean" },
  { path: "businessActivities", required: true, type: "string" },
  { path: "accountPurpose", required: true, type: "string" },
  { path: "expectedMonthlyVolumeUsd", required: true, type: "number" },
  { path: "expectedMonthlyTransactions", required: true, type: "number" }
];

const alfredpayBusinessDocuments: OnboardingDocumentRequirement[] = [
  { acceptedMediaTypes: ALFREDPAY_MEDIA_TYPES, required: true, type: "taxIdDocument" },
  { acceptedMediaTypes: ALFREDPAY_MEDIA_TYPES, required: true, type: "articlesIncorporation" },
  { acceptedMediaTypes: ALFREDPAY_MEDIA_TYPES, required: true, type: "proofAddress" },
  { acceptedMediaTypes: ALFREDPAY_MEDIA_TYPES, required: true, type: "shareholderRegistry" },
  {
    acceptedMediaTypes: ALFREDPAY_MEDIA_TYPES,
    required: false,
    requiredWhen: "isRegulatedBusiness is true",
    type: "businessLicense"
  },
  {
    acceptedMediaTypes: ALFREDPAY_MEDIA_TYPES,
    required: false,
    requiredWhen: "isRegulatedBusiness is true",
    type: "uploadAmlPolicy"
  },
  { acceptedMediaTypes: ALFREDPAY_MEDIA_TYPES, required: true, type: "docFront" },
  { acceptedMediaTypes: ALFREDPAY_MEDIA_TYPES, required: true, type: "docBack" }
];

const alfredpayBusinessFlow = (country: "CO" | "MX"): GetOnboardingRequirementsResponse => ({
  country,
  customerType: "business",
  documentationUrl: "https://api-docs.vortexfinance.co/fiat-corridors",
  documents: alfredpayBusinessDocuments,
  fields: [{ allowedValues: [country], path: "country", required: true, type: "string" }, ...alfredpayBusinessFields],
  flow: `alfredpay-${country.toLowerCase()}-business-api-kyb`,
  mode: "api",
  openapiUrl: OPENAPI_URL,
  provider: "alfredpay",
  requirementsVersion: REQUIREMENTS_VERSION,
  steps: [
    ...alfredpayInitialSteps(country, "business"),
    {
      description: "Create or update the KYB submission with company, representative, and questionnaire data.",
      fixedBody: { country },
      kind: "api",
      method: "POST",
      operationId: "submitAlfredpayKybInformation",
      order: 3,
      path: "/v1/alfredpay/submitKybInformation",
      requestSchema: "#/components/schemas/SubmitKybInformationRequest"
    },
    {
      derivedValues: {
        "body.fileType": "current company document type",
        "body.submissionId": "step 3 response submissionId"
      },
      description: "Upload each required company document.",
      fixedBody: { country },
      kind: "api",
      method: "POST",
      operationId: "submitAlfredpayKybFile",
      order: 4,
      path: "/v1/alfredpay/submitKybFile",
      repeatFor: "company documents",
      requestSchema: "#/components/schemas/AlfredpayKybFileUploadRequest"
    },
    {
      description: "Read the provider identifiers assigned to the submitted related persons.",
      fixedQuery: { country },
      kind: "api",
      method: "GET",
      operationId: "findAlfredpayKybCustomerAndBusiness",
      order: 5,
      path: "/v1/alfredpay/findKybCustomerAndBusiness"
    },
    {
      derivedValues: {
        "body.fileType": "current related-person document type",
        "body.relatedPersonId": "step 5 response relatedPersons[].idRelatedPerson"
      },
      description: "Upload both identity document sides for each related person.",
      fixedBody: { country },
      kind: "api",
      method: "POST",
      operationId: "submitAlfredpayKybRelatedPersonFile",
      order: 6,
      path: "/v1/alfredpay/submitKybRelatedPersonFile",
      repeatFor: "related persons and their required documents",
      requestSchema: "#/components/schemas/AlfredpayKybRelatedPersonFileUploadRequest"
    },
    {
      derivedValues: { "body.submissionId": "step 3 response submissionId" },
      description: "Finalize the KYB submission.",
      fixedBody: { country },
      kind: "api",
      method: "POST",
      operationId: "sendAlfredpayKybSubmission",
      order: 7,
      path: "/v1/alfredpay/sendKybSubmission",
      requestSchema: "#/components/schemas/AlfredpaySendSubmissionRequest"
    },
    {
      description: "Poll the business status until the provider reports a terminal state.",
      fixedQuery: { country, type: "BUSINESS" },
      kind: "api",
      method: "GET",
      operationId: "getAlfredpayKycStatus",
      order: 8,
      path: "/v1/alfredpay/getKycStatus"
    }
  ]
});

const alfredpayHostedFlow = (customerType: CorridorCustomerType): GetOnboardingRequirementsResponse => ({
  country: "US",
  customerType,
  documentationUrl: "https://api-docs.vortexfinance.co/fiat-corridors",
  documents: [],
  fields: [],
  flow: `alfredpay-us-${customerType}-hosted-${customerType === "business" ? "kyb" : "kyc"}`,
  mode: "hosted",
  openapiUrl: OPENAPI_URL,
  provider: "alfredpay",
  requirementsVersion: REQUIREMENTS_VERSION,
  steps: [
    ...alfredpayInitialSteps("US", customerType),
    {
      description: "Create the provider-hosted verification session.",
      fixedQuery: { country: "US" },
      kind: "api",
      method: "GET",
      operationId: customerType === "business" ? "getAlfredpayKybRedirectLink" : "getAlfredpayKycRedirectLink",
      order: 3,
      path: customerType === "business" ? "/v1/alfredpay/getKybRedirectLink" : "/v1/alfredpay/getKycRedirectLink"
    },
    {
      description: "Open the returned provider URL so the customer can supply the hosted requirements.",
      kind: "hosted",
      order: 4
    },
    {
      description: "Record that the provider-hosted session was opened.",
      fixedBody: { country: "US", type: customerType === "business" ? "BUSINESS" : "INDIVIDUAL" },
      kind: "api",
      method: "POST",
      operationId: "notifyAlfredpayKycRedirectOpened",
      order: 5,
      path: "/v1/alfredpay/kycRedirectOpened",
      requestSchema: "#/components/schemas/AlfredpayRedirectNotificationRequest"
    },
    {
      condition: "Call when the customer confirms that the hosted form is complete.",
      description: "Record customer completion without treating it as provider approval.",
      fixedBody: { country: "US", type: customerType === "business" ? "BUSINESS" : "INDIVIDUAL" },
      kind: "api",
      method: "POST",
      operationId: "notifyAlfredpayKycRedirectFinished",
      order: 6,
      path: "/v1/alfredpay/kycRedirectFinished",
      requestSchema: "#/components/schemas/AlfredpayRedirectNotificationRequest"
    },
    {
      description: "Poll until the provider reports a terminal status.",
      fixedQuery: { country: "US", type: customerType === "business" ? "BUSINESS" : "INDIVIDUAL" },
      kind: "api",
      method: "GET",
      operationId: "getAlfredpayKycStatus",
      order: 7,
      path: "/v1/alfredpay/getKycStatus"
    }
  ]
});

const aveniaIndividualFields: OnboardingRequirementField[] = [
  { allowedValues: ["INDIVIDUAL"], path: "accountType", required: true, type: "string" },
  { path: "name", required: true, type: "string" },
  { format: "cpf", path: "taxId", required: true, type: "string" },
  { path: "fullName", required: true, type: "string" },
  { format: "date", path: "dateOfBirth", required: true, type: "string" },
  { allowedValues: ["BRA"], path: "countryOfTaxId", required: true, type: "string" },
  { format: "cpf", path: "taxIdNumber", required: true, type: "string" },
  { format: "email", path: "email", required: true, type: "string" },
  { allowedValues: ["BRA"], path: "country", required: true, type: "string" },
  { path: "state", required: true, type: "string" },
  { path: "city", required: true, type: "string" },
  { path: "zipCode", required: true, type: "string" },
  { path: "streetAddress", required: true, type: "string" }
];

const aveniaBusinessFields: OnboardingRequirementField[] = [
  { allowedValues: ["COMPANY"], path: "accountType", required: true, type: "string" },
  { path: "name", required: true, type: "string" },
  { format: "cnpj", path: "taxId", required: true, type: "string" },
  { path: "fullName", required: true, type: "string" },
  { format: "date", path: "dateOfBirth", required: true, type: "string" },
  { format: "iso-3166-1-alpha-3", path: "countryOfTaxId", required: true, type: "string" },
  { path: "taxIdNumber", required: true, type: "string" },
  { path: "percentageOfOwnership", required: true, type: "string" },
  { format: "iso-3166-1-alpha-3", path: "documentCountry", required: true, type: "string" },
  { path: "streetLine1", required: true, type: "string" },
  { path: "city", required: true, type: "string" },
  { path: "state", required: true, type: "string" },
  { path: "zipCode", required: true, type: "string" },
  { format: "iso-3166-1-alpha-3", path: "country", required: true, type: "string" },
  { path: "companyLegalName", required: true, type: "string" },
  { path: "companyRegistrationNumber", required: true, type: "string" },
  { path: "taxIdentificationNumberTin", required: true, type: "string" },
  { path: "businessActivityDescription", required: true, type: "string" },
  { path: "reasonForAccountOpening", required: true, type: "string" },
  { path: "sourceOfFundsAndIncome", required: true, type: "string" },
  { path: "numberOfEmployees", required: true, type: "string" },
  { path: "estimatedAnnualRevenueUsd", required: true, type: "string" },
  { path: "estimatedMonthlyVolumeUsd", required: true, type: "string" },
  { format: "iso-3166-1-alpha-3", path: "countryTaxResidence", required: true, type: "string" },
  { path: "companyStreetLine1", required: true, type: "string" },
  { path: "companyCity", required: true, type: "string" },
  { path: "companyState", required: true, type: "string" },
  { path: "companyZipCode", required: true, type: "string" },
  { format: "iso-3166-1-alpha-3", path: "companyCountry", required: true, type: "string" }
];

const AVENIA_INDIVIDUAL: GetOnboardingRequirementsResponse = {
  country: "BR",
  customerType: "individual",
  documentationUrl: "https://api-docs.vortexfinance.co/fiat-corridors",
  documents: [
    { collection: "direct-upload", description: "Use ID or DRIVERS-LICENSE.", required: true, type: "identity document" },
    {
      collection: "hosted",
      description: "Completed through the Avenia liveness URL.",
      required: true,
      type: "selfie"
    }
  ],
  fields: aveniaIndividualFields,
  flow: "avenia-br-individual-level-1-kyc",
  mode: "hybrid",
  openapiUrl: OPENAPI_URL,
  provider: "avenia",
  requirementsVersion: REQUIREMENTS_VERSION,
  steps: [
    {
      description: "Read the current Avenia subaccount and KYC level.",
      kind: "api",
      method: "GET",
      operationId: "getBrlaUser",
      order: 1,
      path: "/v1/brla/getUser"
    },
    {
      condition: "Run only when no Avenia subaccount exists.",
      description: "Create the individual Avenia subaccount.",
      kind: "api",
      method: "POST",
      operationId: "createSubaccount",
      order: 2,
      path: "/v1/brla/createSubaccount",
      requestSchema: "#/components/schemas/CreateSubaccountRequest"
    },
    {
      description: "Create identity-document and selfie upload targets.",
      kind: "api",
      method: "POST",
      operationId: "brlaGetUploadUrls",
      order: 3,
      path: "/v1/brla/getUploadUrls",
      requestSchema: "#/components/schemas/AveniaKYCDataUploadRequest"
    },
    {
      description: "Upload identity-document bytes to the returned presigned URL.",
      kind: "direct-upload",
      method: "PUT",
      order: 4
    },
    {
      description: "Open and complete the returned provider-hosted liveness URL.",
      kind: "hosted",
      order: 5
    },
    {
      derivedValues: {
        "body.subAccountId": "step 1 or 2 response subAccountId",
        "body.uploadedDocumentId": "step 3 response idUpload.id",
        "body.uploadedSelfieId": "step 3 response selfieUpload.id"
      },
      description: "Submit the Level 1 KYC data after both uploads are ready.",
      kind: "api",
      method: "POST",
      operationId: "brlaNewKyc",
      order: 6,
      path: "/v1/brla/newKyc",
      requestSchema: "#/components/schemas/KycLevel1Payload"
    },
    {
      description: "Poll until Avenia reports a terminal KYC decision.",
      kind: "api",
      method: "GET",
      operationId: "fetchSubaccountKycStatus",
      order: 7,
      path: "/v1/brla/getKycStatus"
    }
  ]
};

const AVENIA_BUSINESS: GetOnboardingRequirementsResponse = {
  country: "BR",
  customerType: "business",
  documentationUrl: "https://api-docs.vortexfinance.co/fiat-corridors",
  documents: [
    { collection: "direct-upload", required: true, type: "CERTIFICATE-OF-INCORPORATION" },
    { collection: "direct-upload", required: true, type: "COMPANY-TAX-IDENTIFICATION-DOCUMENT" },
    {
      collection: "direct-upload",
      description: "Required for each UBO.",
      required: true,
      type: "ID, DRIVERS-LICENSE, PASSPORT, or RESIDENCE-PERMIT"
    },
    {
      collection: "hosted",
      description: "Optional provider-hosted liveness evidence for a UBO.",
      required: false,
      type: "SELFIE-FROM-LIVENESS"
    }
  ],
  fields: aveniaBusinessFields,
  flow: "avenia-br-business-level-1-api-kyb",
  mode: "api",
  openapiUrl: OPENAPI_URL,
  provider: "avenia",
  requirementsVersion: REQUIREMENTS_VERSION,
  steps: [
    {
      description: "Read the current Avenia company subaccount.",
      kind: "api",
      method: "GET",
      operationId: "getBrlaUser",
      order: 1,
      path: "/v1/brla/getUser"
    },
    {
      condition: "Run only when no Avenia company subaccount exists.",
      description: "Create the company Avenia subaccount.",
      kind: "api",
      method: "POST",
      operationId: "createSubaccount",
      order: 2,
      path: "/v1/brla/createSubaccount",
      requestSchema: "#/components/schemas/CreateSubaccountRequest"
    },
    {
      derivedValues: {
        "body.documentType": "current document type",
        "query.subAccountId": "step 1 or 2 response subAccountId"
      },
      description: "Create an upload target for each company and UBO document.",
      kind: "api",
      method: "POST",
      operationId: "createAveniaKybDocument",
      order: 3,
      path: "/v1/brla/kyb/documents",
      repeatFor: "documents",
      requestSchema: "#/components/schemas/AveniaKybDocumentRequest"
    },
    {
      description: "Upload document bytes to each returned presigned URL.",
      kind: "direct-upload",
      method: "PUT",
      order: 4,
      repeatFor: "documents where collection is direct-upload"
    },
    {
      condition: "Run for each optional SELFIE-FROM-LIVENESS document the integrator chooses to collect.",
      description: "Open and complete the provider-hosted liveness URL returned when the document was created.",
      kind: "hosted",
      order: 5,
      repeatFor: "documents where collection is hosted"
    },
    {
      derivedValues: {
        "path.documentId": "step 3 response id for the current document",
        "query.subAccountId": "step 1 or 2 response subAccountId"
      },
      description: "Poll each document until it is ready before referencing it.",
      kind: "api",
      method: "GET",
      operationId: "getAveniaKybDocument",
      order: 6,
      path: "/v1/brla/kyb/documents/{documentId}",
      repeatFor: "documents"
    },
    {
      derivedValues: {
        "body.uploadedIdentificationId": "step 3 response id for the current UBO identity document",
        "body.uploadedSelfieId": "step 3 response id for the current optional SELFIE-FROM-LIVENESS document",
        "query.subAccountId": "step 1 or 2 response subAccountId"
      },
      description: "Register each UBO using ready identity documents.",
      kind: "api",
      method: "POST",
      operationId: "createAveniaKybUbo",
      order: 7,
      path: "/v1/brla/kyb/ubos",
      repeatFor: "UBOs",
      requestSchema: "#/components/schemas/AveniaUboPayload"
    },
    {
      derivedValues: {
        "body.certificateOfIncorporationDocumentId": "step 3 response id for CERTIFICATE-OF-INCORPORATION",
        "body.taxIdentificationDocumentId": "step 3 response id for COMPANY-TAX-IDENTIFICATION-DOCUMENT",
        "body.uboIds": "step 7 response ids",
        "query.subAccountId": "step 1 or 2 response subAccountId"
      },
      description: "Submit the company Level 1 KYB attempt.",
      kind: "api",
      method: "POST",
      operationId: "submitAveniaKybLevel1Api",
      order: 8,
      path: "/v1/brla/kyb/new-level-1/api",
      requestSchema: "#/components/schemas/AveniaKybLevel1Payload"
    },
    {
      derivedValues: { "query.attemptId": "step 8 response id" },
      description: "Poll until Avenia reports a terminal KYB decision.",
      kind: "api",
      method: "GET",
      operationId: "getAveniaKybAttemptStatus",
      order: 9,
      path: "/v1/brla/kyb/attempt-status"
    }
  ]
};

export const ONBOARDING_REQUIREMENTS: Record<
  OnboardingRequirementsCountry,
  Partial<Record<CorridorCustomerType, GetOnboardingRequirementsResponse>>
> = {
  AR: { individual: alfredpayIndividualFlow("AR") },
  BR: { business: AVENIA_BUSINESS, individual: AVENIA_INDIVIDUAL },
  CO: { business: alfredpayBusinessFlow("CO"), individual: alfredpayIndividualFlow("CO") },
  MX: { business: alfredpayBusinessFlow("MX"), individual: alfredpayIndividualFlow("MX") },
  US: { business: alfredpayHostedFlow("business"), individual: alfredpayHostedFlow("individual") }
};

export function getOnboardingRequirements(
  country: OnboardingRequirementsCountry,
  customerType: CorridorCustomerType
): GetOnboardingRequirementsResponse | undefined {
  return ONBOARDING_REQUIREMENTS[country][customerType];
}
