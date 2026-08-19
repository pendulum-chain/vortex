import type { CorridorCustomerType } from "../corridors";

export type OnboardingRequirementsCountry = "AR" | "BR" | "CO" | "MX" | "US";
export type OnboardingFlowMode = "api" | "hosted" | "hybrid";
/** Endpoint family that serves a flow. Stable across a change of underlying provider. */
export type OnboardingFlowFamily = "br" | "domestic";
export type OnboardingStepKind = "api" | "direct-upload" | "hosted";

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
  method?: "POST" | "PUT";
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
  flow: string;
  mode: OnboardingFlowMode;
  openapiUrl: string;
  family: OnboardingFlowFamily;
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

const REQUIREMENTS_VERSION = "2026-08-19";
const OPENAPI_URL = "https://raw.githubusercontent.com/pendulum-chain/vortex/main/docs/api/openapi/vortex.openapi.json";
const DOCUMENTATION_URL = "https://api-docs.vortexfinance.co/fiat-corridors";
const DOMESTIC_MEDIA_TYPES = ["image/jpeg", "image/png", "application/pdf"];

const domesticInitialSteps = (
  country: OnboardingRequirementsCountry,
  customerType: CorridorCustomerType
): OnboardingRequirementStep[] => [
  {
    condition: "Run only when no provider customer exists.",
    description: `Create the ${customerType} provider customer.`,
    fixedBody: { country },
    kind: "api",
    method: "POST",
    operationId: customerType === "business" ? "createDomesticBusinessCustomer" : "createDomesticIndividualCustomer",
    order: 1,
    path: customerType === "business" ? "/v1/domestic/createBusinessCustomer" : "/v1/domestic/createIndividualCustomer",
    requestSchema: "#/components/schemas/DomesticCreateCustomerRequest"
  }
];

const domesticIndividualFlow = (country: "AR" | "CO" | "MX"): GetOnboardingRequirementsResponse => ({
  country,
  customerType: "individual",
  documentationUrl: DOCUMENTATION_URL,
  documents: [
    { acceptedMediaTypes: DOMESTIC_MEDIA_TYPES, required: true, type: "National ID Front" },
    { acceptedMediaTypes: DOMESTIC_MEDIA_TYPES, required: true, type: "National ID Back" },
    ...(country === "AR" ? [{ acceptedMediaTypes: DOMESTIC_MEDIA_TYPES, required: true, type: "Selfie" }] : [])
  ],
  family: "domestic",
  flow: `${country.toLowerCase()}-individual-api-kyc`,
  mode: "api",
  openapiUrl: OPENAPI_URL,
  requirementsVersion: REQUIREMENTS_VERSION,
  steps: [
    ...domesticInitialSteps(country, "individual"),
    {
      description: "Create the KYC submission with the collected identity data.",
      fixedBody: { country },
      kind: "api",
      method: "POST",
      operationId: "submitDomesticKycInformation",
      order: 2,
      path: "/v1/domestic/submitKycInformation",
      requestSchema: "#/components/schemas/SubmitKycInformationRequest"
    },
    {
      derivedValues: { "body.fileType": "current document type", "body.submissionId": "step 2 response submissionId" },
      description: "Upload each required identity document.",
      fixedBody: { country },
      kind: "api",
      method: "POST",
      operationId: "submitDomesticKycFile",
      order: 3,
      path: "/v1/domestic/submitKycFile",
      repeatFor: "documents",
      requestSchema: "#/components/schemas/DomesticKycFileUploadRequest"
    },
    {
      derivedValues: { "body.submissionId": "step 2 response submissionId" },
      description: "Finalize the KYC submission.",
      fixedBody: { country },
      kind: "api",
      method: "POST",
      operationId: "sendDomesticKycSubmission",
      order: 4,
      path: "/v1/domestic/sendKycSubmission",
      requestSchema: "#/components/schemas/DomesticSendSubmissionRequest"
    }
  ]
});

const domesticBusinessDocuments: OnboardingDocumentRequirement[] = [
  { acceptedMediaTypes: DOMESTIC_MEDIA_TYPES, required: true, type: "taxIdDocument" },
  { acceptedMediaTypes: DOMESTIC_MEDIA_TYPES, required: true, type: "articlesIncorporation" },
  { acceptedMediaTypes: DOMESTIC_MEDIA_TYPES, required: true, type: "proofAddress" },
  { acceptedMediaTypes: DOMESTIC_MEDIA_TYPES, required: true, type: "shareholderRegistry" },
  {
    acceptedMediaTypes: DOMESTIC_MEDIA_TYPES,
    required: false,
    requiredWhen: "isRegulatedBusiness is true",
    type: "businessLicense"
  },
  {
    acceptedMediaTypes: DOMESTIC_MEDIA_TYPES,
    required: false,
    requiredWhen: "isRegulatedBusiness is true",
    type: "uploadAmlPolicy"
  },
  { acceptedMediaTypes: DOMESTIC_MEDIA_TYPES, required: true, type: "docFront" },
  { acceptedMediaTypes: DOMESTIC_MEDIA_TYPES, required: true, type: "docBack" }
];

const domesticBusinessFlow = (country: "CO" | "MX"): GetOnboardingRequirementsResponse => ({
  country,
  customerType: "business",
  documentationUrl: DOCUMENTATION_URL,
  documents: domesticBusinessDocuments,
  family: "domestic",
  flow: `${country.toLowerCase()}-business-api-kyb`,
  mode: "api",
  openapiUrl: OPENAPI_URL,
  requirementsVersion: REQUIREMENTS_VERSION,
  steps: [
    ...domesticInitialSteps(country, "business"),
    {
      description: "Create or update the KYB submission with company, representative, and questionnaire data.",
      fixedBody: { country },
      kind: "api",
      method: "POST",
      operationId: "submitDomesticKybInformation",
      order: 2,
      path: "/v1/domestic/submitKybInformation",
      requestSchema: "#/components/schemas/SubmitKybInformationRequest"
    },
    {
      derivedValues: {
        "body.fileType": "current company document type",
        "body.submissionId": "step 2 response submissionId"
      },
      description: "Upload each required company document.",
      fixedBody: { country },
      kind: "api",
      method: "POST",
      operationId: "submitDomesticKybFile",
      order: 3,
      path: "/v1/domestic/submitKybFile",
      repeatFor: "company documents",
      requestSchema: "#/components/schemas/DomesticKybFileUploadRequest"
    },
    {
      derivedValues: {
        "body.fileType": "current related-person document type"
      },
      description: "Upload both identity document sides for each related person.",
      fixedBody: { country },
      kind: "api",
      method: "POST",
      operationId: "submitDomesticKybRelatedPersonFile",
      order: 4,
      path: "/v1/domestic/submitKybRelatedPersonFile",
      repeatFor: "related persons and their required documents",
      requestSchema: "#/components/schemas/DomesticKybRelatedPersonFileUploadRequest"
    },
    {
      derivedValues: { "body.submissionId": "step 2 response submissionId" },
      description: "Finalize the KYB submission.",
      fixedBody: { country },
      kind: "api",
      method: "POST",
      operationId: "sendDomesticKybSubmission",
      order: 5,
      path: "/v1/domestic/sendKybSubmission",
      requestSchema: "#/components/schemas/DomesticSendSubmissionRequest"
    }
  ]
});

const domesticHostedFlow = (customerType: CorridorCustomerType): GetOnboardingRequirementsResponse => ({
  country: "US",
  customerType,
  documentationUrl: DOCUMENTATION_URL,
  documents: [],
  family: "domestic",
  flow: `us-${customerType}-hosted-${customerType === "business" ? "kyb" : "kyc"}`,
  mode: "hosted",
  openapiUrl: OPENAPI_URL,
  requirementsVersion: REQUIREMENTS_VERSION,
  steps: [
    ...domesticInitialSteps("US", customerType),
    {
      description: "Open the provider-hosted verification URL as described in the integration documentation.",
      kind: "hosted",
      order: 2
    },
    {
      description: "Record that the provider-hosted session was opened.",
      fixedBody: { country: "US", type: customerType === "business" ? "BUSINESS" : "INDIVIDUAL" },
      kind: "api",
      method: "POST",
      operationId: "notifyDomesticKycRedirectOpened",
      order: 3,
      path: "/v1/domestic/kycRedirectOpened",
      requestSchema: "#/components/schemas/DomesticRedirectNotificationRequest"
    },
    {
      condition: "Call when the customer confirms that the hosted form is complete.",
      description: "Record customer completion without treating it as provider approval.",
      fixedBody: { country: "US", type: customerType === "business" ? "BUSINESS" : "INDIVIDUAL" },
      kind: "api",
      method: "POST",
      operationId: "notifyDomesticKycRedirectFinished",
      order: 4,
      path: "/v1/domestic/kycRedirectFinished",
      requestSchema: "#/components/schemas/DomesticRedirectNotificationRequest"
    }
  ]
});

const BR_INDIVIDUAL: GetOnboardingRequirementsResponse = {
  country: "BR",
  customerType: "individual",
  documentationUrl: DOCUMENTATION_URL,
  documents: [
    { collection: "direct-upload", description: "Use ID or DRIVERS-LICENSE.", required: true, type: "identity document" },
    {
      collection: "hosted",
      description: "Completed through the provider liveness URL.",
      required: true,
      type: "selfie"
    }
  ],
  family: "br",
  flow: "br-individual-level-1-kyc",
  mode: "hybrid",
  openapiUrl: OPENAPI_URL,
  requirementsVersion: REQUIREMENTS_VERSION,
  steps: [
    {
      condition: "Run only when no subaccount exists.",
      description: "Create the individual subaccount.",
      kind: "api",
      method: "POST",
      operationId: "createSubaccount",
      order: 1,
      path: "/v1/brl/createSubaccount",
      requestSchema: "#/components/schemas/CreateSubaccountRequest"
    },
    {
      description: "Create identity-document and selfie upload targets.",
      kind: "api",
      method: "POST",
      operationId: "brGetUploadUrls",
      order: 2,
      path: "/v1/brl/getUploadUrls",
      requestSchema: "#/components/schemas/BrKYCDataUploadRequest"
    },
    {
      description: "Upload identity-document bytes to the returned presigned URL.",
      kind: "direct-upload",
      method: "PUT",
      order: 3
    },
    { description: "Open and complete the returned provider-hosted liveness URL.", kind: "hosted", order: 4 },
    {
      derivedValues: {
        "body.subAccountId": "step 1 response subAccountId",
        "body.uploadedDocumentId": "step 2 response idUpload.id",
        "body.uploadedSelfieId": "step 2 response selfieUpload.id"
      },
      description: "Submit the Level 1 KYC data after both uploads are ready.",
      kind: "api",
      method: "POST",
      operationId: "brNewKyc",
      order: 5,
      path: "/v1/brl/newKyc",
      requestSchema: "#/components/schemas/KycLevel1Payload"
    }
  ]
};

const BR_BUSINESS: GetOnboardingRequirementsResponse = {
  country: "BR",
  customerType: "business",
  documentationUrl: DOCUMENTATION_URL,
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
  family: "br",
  flow: "br-business-level-1-api-kyb",
  mode: "api",
  openapiUrl: OPENAPI_URL,
  requirementsVersion: REQUIREMENTS_VERSION,
  steps: [
    {
      condition: "Run only when no company subaccount exists.",
      description: "Create the company subaccount.",
      kind: "api",
      method: "POST",
      operationId: "createSubaccount",
      order: 1,
      path: "/v1/brl/createSubaccount",
      requestSchema: "#/components/schemas/CreateSubaccountRequest"
    },
    {
      derivedValues: {
        "body.documentType": "current document type",
        "query.subAccountId": "step 1 response subAccountId"
      },
      description: "Create an upload target for each company and UBO document.",
      kind: "api",
      method: "POST",
      operationId: "createBrKybDocument",
      order: 2,
      path: "/v1/brl/kyb/documents",
      repeatFor: "documents",
      requestSchema: "#/components/schemas/BrKybDocumentRequest"
    },
    {
      description: "Upload document bytes to each returned presigned URL.",
      kind: "direct-upload",
      method: "PUT",
      order: 3,
      repeatFor: "documents where collection is direct-upload"
    },
    {
      condition: "Run for each optional SELFIE-FROM-LIVENESS document the integrator chooses to collect.",
      description: "Open and complete the provider-hosted liveness URL returned when the document was created.",
      kind: "hosted",
      order: 4,
      repeatFor: "documents where collection is hosted"
    },
    {
      derivedValues: {
        "body.uploadedIdentificationId": "step 2 response id for the current UBO identity document",
        "body.uploadedSelfieId": "step 2 response id for the current optional SELFIE-FROM-LIVENESS document",
        "query.subAccountId": "step 1 response subAccountId"
      },
      description: "Register each UBO using ready identity documents.",
      kind: "api",
      method: "POST",
      operationId: "createBrKybUbo",
      order: 5,
      path: "/v1/brl/kyb/ubos",
      repeatFor: "UBOs",
      requestSchema: "#/components/schemas/BrUboPayload"
    },
    {
      derivedValues: {
        "body.certificateOfIncorporationDocumentId": "step 2 response id for CERTIFICATE-OF-INCORPORATION",
        "body.taxIdentificationDocumentId": "step 2 response id for COMPANY-TAX-IDENTIFICATION-DOCUMENT",
        "body.uboIds": "step 5 response ids",
        "query.subAccountId": "step 1 response subAccountId"
      },
      description: "Submit the company Level 1 KYB attempt.",
      kind: "api",
      method: "POST",
      operationId: "submitBrKybLevel1Api",
      order: 6,
      path: "/v1/brl/kyb/new-level-1/api",
      requestSchema: "#/components/schemas/BrKybLevel1Payload"
    }
  ]
};

export const ONBOARDING_REQUIREMENTS: Record<
  OnboardingRequirementsCountry,
  Partial<Record<CorridorCustomerType, GetOnboardingRequirementsResponse>>
> = {
  AR: { individual: domesticIndividualFlow("AR") },
  BR: { business: BR_BUSINESS, individual: BR_INDIVIDUAL },
  CO: { business: domesticBusinessFlow("CO"), individual: domesticIndividualFlow("CO") },
  MX: { business: domesticBusinessFlow("MX"), individual: domesticIndividualFlow("MX") },
  US: { business: domesticHostedFlow("business"), individual: domesticHostedFlow("individual") }
};

export function getOnboardingRequirements(
  country: OnboardingRequirementsCountry,
  customerType: CorridorCustomerType
): GetOnboardingRequirementsResponse | undefined {
  return ONBOARDING_REQUIREMENTS[country][customerType];
}
