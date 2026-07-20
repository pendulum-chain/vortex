import Big from "big.js";
import { ALFREDPAY_API_KEY, ALFREDPAY_API_SECRET, ALFREDPAY_BASE_URL } from "../..";
import logger from "../../logger";
import { ProviderHttpError } from "../providerHttpError";
import {
  AlfredpayCustomerType,
  AlfredpayFee,
  AlfredpayFiatAccountFields,
  AlfredpayFiatAccountType,
  AlfredpayFiatCurrency,
  AlfredpayKybCustomerAndBusiness,
  AlfredpayKybFileType,
  AlfredpayKybRelatedPersonFileType,
  AlfredpayKycFileType,
  AlfredpayOfframpQuote,
  AlfredpayOnrampQuote,
  AlfredpayTradeLimitError,
  CreateAlfredpayCustomerResponse,
  CreateAlfredpayFiatAccountRequest,
  CreateAlfredpayFiatAccountResponse,
  CreateAlfredpayOfframpQuoteRequest,
  CreateAlfredpayOfframpRequest,
  CreateAlfredpayOfframpResponse,
  CreateAlfredpayOnrampQuoteRequest,
  CreateAlfredpayOnrampRequest,
  CreateAlfredpayOnrampResponse,
  FindAlfredpayCustomerResponse,
  GetAlfredpayOnrampTransactionResponse,
  GetAllConfigsResponse,
  GetKybRedirectLinkResponse,
  GetKybStatusResponse,
  GetKybSubmissionResponse,
  GetKycRedirectLinkResponse,
  GetKycStatusResponse,
  GetKycSubmissionResponse,
  ListAlfredpayFiatAccountsResponse,
  RetryKybSubmissionResponse,
  RetryKycSubmissionResponse,
  SubmitKybInformationRequest,
  SubmitKybInformationResponse,
  SubmitKycInformationRequest,
  SubmitKycInformationResponse
} from "./types";

/**
 * Error thrown when an Alfredpay HTTP request fails. See {@link ProviderHttpError} for the
 * carried fields and the message-format invariant.
 */
export class AlfredpayApiError extends ProviderHttpError {
  constructor(params: { status: number; endpoint: string; method: string; responseBody: string }) {
    super({ ...params, provider: "alfredpay" });
  }
}

// A hung provider call must not stall callers — the dashboard's onboarding status poll awaits
// these requests inline.
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Alfredpay's relate-person upload rejects any non-ASCII byte in the multipart filename with a
 * bare 5xx `{"errorCode":111301,"errorMessage":"UNKNOWN_ERROR"}`. Verified against the sandbox:
 * `ñandú.png` and `acentuación.png` fail while `with space.png`, `parens(1).png` and
 * `IMG_1234.png` pass, on the very customer and related person a production upload failed for.
 *
 * The filename we send is throwaway — Alfredpay stores every upload under a generated
 * `{uuid}.{ext}` — but it reaches users, who name documents in their own language
 * ("Identificación oficial.png"). So transliterate accents, replace anything else outside
 * `[A-Za-z0-9._-]`, and keep the extension. Applied to all three uploads: only relate-person is
 * known to reject these, and the company-document endpoint next door accepts them, but a name
 * that is discarded on arrival is not worth a per-endpoint carve-out.
 */
export function toAsciiFileName(name: string): string {
  const withoutAccents = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const ascii = withoutAccents.replace(/[^A-Za-z0-9._-]/g, "_");
  // A name that was entirely non-ASCII collapses to underscores; give the provider something.
  return /[A-Za-z0-9]/.test(ascii) ? ascii : `upload${ascii}`;
}

/**
 * Rebuild the upload under an ASCII name, copying the bytes out first.
 *
 * The copy is load-bearing, and neither shorter spelling works under Bun: `new File([file], name)`
 * and `new Blob([file])` alias a single Blob part rather than copying it, so the result stays the
 * original File and keeps its name, and `formData.append(field, file, name)` then ignores its
 * filename argument because the value is a File. Every one of those silently sends the original
 * name — alfredpayApiService.test.ts asserts the name that actually reaches the wire, so it fails
 * if this is "simplified" back into any of them.
 *
 * The uploads are typed Blob, which carries no name; only the File the controllers build from the
 * multipart request does.
 */
async function asAsciiNamedUpload(file: Blob): Promise<File> {
  const name = file instanceof File ? toAsciiFileName(file.name) : "upload";
  return new File([await file.arrayBuffer()], name, { type: file.type });
}

export class AlfredpayApiService {
  private static instance: AlfredpayApiService;

  private apiKey: string;

  private apiSecret: string;

  private constructor() {
    if (!ALFREDPAY_API_KEY || !ALFREDPAY_API_SECRET) {
      throw new Error("ALFREDPAY_API_KEY or ALFREDPAY_API_SECRET not defined");
    }
    this.apiKey = ALFREDPAY_API_KEY;
    this.apiSecret = ALFREDPAY_API_SECRET;
  }

  public static getInstance(): AlfredpayApiService {
    if (!AlfredpayApiService.instance) {
      AlfredpayApiService.instance = new AlfredpayApiService();
    }
    return AlfredpayApiService.instance;
  }

  public static sumFeesByCurrency(fees: AlfredpayFee[], currency: AlfredpayFiatCurrency): Big {
    return fees.filter(fee => fee.currency === currency).reduce((total, fee) => total.plus(new Big(fee.amount)), new Big(0));
  }

  private async executeRequest<T>(
    path: string,
    method: string,
    payload?: unknown,
    queryParams?: string
  ): Promise<T | undefined> {
    const headers = {
      Accept: "application/json",
      "api-key": this.apiKey,
      "api-secret": this.apiSecret,
      "Content-Type": "application/json"
    };

    let url = path;

    if (queryParams) {
      url += `?${queryParams}`;
    }

    const options: RequestInit = {
      headers,
      method,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    };

    if (payload !== undefined) {
      options.body = JSON.stringify(payload);
    }
    const fullUrl = `${ALFREDPAY_BASE_URL}${url}`;
    logger.current.debug(`Sending request to ${fullUrl} with method ${method} and payload:`, payload);

    let response: Response;
    try {
      response = await fetch(fullUrl, options);
    } catch (error) {
      // Transport failure (DNS/timeout/connection reset) — no HTTP response. Surface it as a
      // provider error with status 0 so callers can normalize it to a 502 instead of a 500.
      throw new AlfredpayApiError({
        endpoint: path,
        method,
        responseBody: error instanceof Error ? error.message : String(error),
        status: 0
      });
    }

    if (response.status === 401) {
      throw new Error("Authorization error.");
    }

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 409) {
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.errorCode === 111426 && parsed.errorMetadata) {
            const { minQuantity, maxQuantity, fromCurrency } = parsed.errorMetadata;
            logger.current.warn(
              `Alfredpay trade limit hit: minQuantity=${minQuantity} maxQuantity=${maxQuantity} fromCurrency=${fromCurrency}`
            );
            // The wire carries the quantities as JSON numbers (see alfredpayLimitErrorBodySchema);
            // the error exposes them as strings.
            throw maxQuantity !== undefined
              ? AlfredpayTradeLimitError.above(String(maxQuantity), fromCurrency)
              : AlfredpayTradeLimitError.below(String(minQuantity), fromCurrency);
          }
        } catch (parseError) {
          if (parseError instanceof AlfredpayTradeLimitError) {
            throw parseError;
          }
        }
      }
      // AlfredpayApiError keeps the "status '<code>'. Error: <body>" message shape that this
      // controller's callers match on, and exposes endpoint/method/status for structured logging.
      throw new AlfredpayApiError({
        endpoint: path,
        method,
        responseBody: errorText,
        status: response.status
      });
    }
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  public async createCustomer(
    email: string,
    type: AlfredpayCustomerType,
    country: string
  ): Promise<CreateAlfredpayCustomerResponse> {
    const payload = {
      country,
      email,
      type
    };
    return (await this.executeRequest(
      "/api/v1/third-party-service/penny/customers/create",
      "POST",
      payload
    )) as CreateAlfredpayCustomerResponse;
  }

  /**
   * Fetch all supported trading pairs and their per-pair / per-customer-type quantity limits.
   * Docs: https://alfredpay.readme.io/v2.0/reference/configurationscontroller_getallconfigs-3
   * Alfredpay renamed the route: the former /configurations path now returns
   * 400 errorCode 111301 (caught by the nightly contract suite, 2026-07-14).
   */
  public async getAllConfigs(): Promise<GetAllConfigsResponse> {
    const path = "/api/v1/third-party-service/penny/allConfigs";
    return (await this.executeRequest<GetAllConfigsResponse>(path, "GET")) ?? { supportedPairs: [] };
  }

  public async findCustomer(email: string, country: string): Promise<FindAlfredpayCustomerResponse> {
    const encodedEmail = encodeURIComponent(email);
    const path = `/api/v1/third-party-service/penny/customers/find/${encodedEmail}/${country}`;
    return (await this.executeRequest(path, "GET")) as FindAlfredpayCustomerResponse;
  }

  public async getKycRedirectLink(customerId: string, country: string): Promise<GetKycRedirectLinkResponse> {
    const path = `/api/v1/third-party-service/penny/customers/${customerId}/kyc/${country}/url`;
    return (await this.executeRequest(path, "GET")) as GetKycRedirectLinkResponse;
  }

  public async getKycStatus(customerId: string, submissionId: string): Promise<GetKycStatusResponse> {
    const path = `/api/v1/third-party-service/penny/customers/${customerId}/kyc/${submissionId}/status`;
    return (await this.executeRequest(path, "GET")) as GetKycStatusResponse;
  }

  public async getLastKycSubmission(customerId: string): Promise<GetKycSubmissionResponse> {
    const path = `/api/v1/third-party-service/penny/customers/kyc/${customerId}`;
    return (await this.executeRequest(path, "GET")) as GetKycSubmissionResponse;
  }

  public async retryKycSubmission(customerId: string, submissionId: string): Promise<RetryKycSubmissionResponse> {
    const path = `/api/v1/third-party-service/penny/customers/${customerId}/kyc/${submissionId}/retry`;
    return (await this.executeRequest(path, "POST")) as RetryKycSubmissionResponse;
  }

  public async getKybRedirectLink(customerId: string): Promise<GetKybRedirectLinkResponse> {
    const path = `/api/v1/third-party-service/penny/customers/kyb/${customerId}/verification/url`;
    return (await this.executeRequest(path, "GET")) as GetKybRedirectLinkResponse;
  }

  public async getKybStatus(customerId: string, submissionId: string): Promise<GetKybStatusResponse> {
    const path = `/api/v1/third-party-service/penny/customers/${customerId}/kyb/${submissionId}/status`;
    return (await this.executeRequest(path, "GET")) as GetKybStatusResponse;
  }

  public async getLastKybSubmission(customerId: string): Promise<GetKybSubmissionResponse> {
    const path = `/api/v1/third-party-service/penny/customers/kyb/${customerId}`;
    return (await this.executeRequest(path, "GET")) as GetKybSubmissionResponse;
  }

  // Alfredpay has no dedicated KYB retry endpoint. Retry is handled by fetching a new verification URL.
  public async retryKybSubmission(_customerId: string, _submissionId: string): Promise<RetryKybSubmissionResponse> {
    return { message: "ok" };
  }

  public async createOnrampQuote(request: CreateAlfredpayOnrampQuoteRequest): Promise<AlfredpayOnrampQuote> {
    const path = "/api/v1/third-party-service/penny/quotes";
    return (await this.executeRequest(path, "POST", request)) as AlfredpayOnrampQuote;
  }

  public async createOfframpQuote(request: CreateAlfredpayOfframpQuoteRequest): Promise<AlfredpayOfframpQuote> {
    const path = "/api/v1/third-party-service/penny/quotes";
    return (await this.executeRequest(path, "POST", request)) as AlfredpayOfframpQuote;
  }

  public async getQuote(quoteId: string): Promise<AlfredpayOnrampQuote | AlfredpayOfframpQuote> {
    const path = `/api/v1/third-party-service/penny/quotes/${quoteId}`;
    return (await this.executeRequest(path, "GET")) as AlfredpayOnrampQuote | AlfredpayOfframpQuote;
  }

  public async createOnramp(request: CreateAlfredpayOnrampRequest): Promise<CreateAlfredpayOnrampResponse> {
    const path = "/api/v1/third-party-service/penny/onramp";
    return (await this.executeRequest(path, "POST", request)) as CreateAlfredpayOnrampResponse;
  }

  public async getOnrampTransaction(transactionId: string): Promise<GetAlfredpayOnrampTransactionResponse> {
    const path = `/api/v1/third-party-service/penny/onramp/${transactionId}`;
    return (await this.executeRequest(path, "GET")) as GetAlfredpayOnrampTransactionResponse;
  }

  public async createOfframp(request: CreateAlfredpayOfframpRequest): Promise<CreateAlfredpayOfframpResponse> {
    const path = "/api/v1/third-party-service/penny/offramp";
    return (await this.executeRequest(path, "POST", request)) as CreateAlfredpayOfframpResponse;
  }

  public async getOfframpTransaction(transactionId: string): Promise<CreateAlfredpayOfframpResponse> {
    const path = `/api/v1/third-party-service/penny/offramp/${transactionId}`;
    return (await this.executeRequest(path, "GET")) as CreateAlfredpayOfframpResponse;
  }

  public async createFiatAccount(
    customerId: string,
    type: AlfredpayFiatAccountType,
    fiatAccountFields: AlfredpayFiatAccountFields,
    isExternal: boolean
  ): Promise<CreateAlfredpayFiatAccountResponse> {
    const payload: CreateAlfredpayFiatAccountRequest = { customerId, fiatAccountFields, isExternal, type };
    const path = "/api/v1/third-party-service/penny/fiatAccounts";
    return (await this.executeRequest(path, "POST", payload)) as CreateAlfredpayFiatAccountResponse;
  }

  public async listFiatAccounts(customerId: string): Promise<ListAlfredpayFiatAccountsResponse> {
    const path = `/api/v1/third-party-service/penny/fiatAccounts?customerId=${encodeURIComponent(customerId)}`;
    return (await this.executeRequest(path, "GET")) as ListAlfredpayFiatAccountsResponse;
  }

  public async deleteFiatAccount(customerId: string, fiatAccountId: string): Promise<void> {
    const path = `/api/v1/third-party-service/penny/fiatAccounts/${encodeURIComponent(customerId)}/${encodeURIComponent(fiatAccountId)}`;
    await this.executeRequest(path, "DELETE");
  }

  public async submitKycInformation(
    customerId: string,
    data: SubmitKycInformationRequest
  ): Promise<SubmitKycInformationResponse> {
    const path = `/api/v1/third-party-service/penny/customers/${customerId}/kyc`;
    const kycSubmission: Record<string, unknown> = { ...data };
    if (!kycSubmission.nationalities) kycSubmission.nationalities = [data.country];
    if (!data.typeDocument) delete kycSubmission.typeDocument;
    if (!data.typeDocumentCol) delete kycSubmission.typeDocumentCol;
    delete kycSubmission.typeDocumentAr; // Currently not required, (typeDocument throws an error on Alfredpay side)
    if (!data.phoneNumber) delete kycSubmission.phoneNumber;
    if (!data.cuit) delete kycSubmission.cuit;
    if (data.pep !== false && !data.pep) delete kycSubmission.pep;
    if (!data.countryCode) delete kycSubmission.countryCode;
    return (await this.executeRequest(path, "POST", { kycSubmission })) as SubmitKycInformationResponse;
  }

  public async submitKycFile(
    customerId: string,
    submissionId: string,
    fileType: AlfredpayKycFileType,
    file: Blob
  ): Promise<void> {
    const formData = new FormData();
    formData.append("fileBody", await asAsciiNamedUpload(file));
    formData.append("fileType", fileType);

    const url = `${ALFREDPAY_BASE_URL}/api/v1/third-party-service/penny/customers/${customerId}/kyc/${submissionId}/files`;
    const response = await fetch(url, {
      body: formData,
      headers: {
        "api-key": this.apiKey,
        "api-secret": this.apiSecret
      },
      method: "POST"
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload KYC file: ${errorText}`);
    }
  }

  public async sendKycSubmission(customerId: string, submissionId: string): Promise<void> {
    const path = `/api/v1/third-party-service/penny/customers/${customerId}/kyc/${submissionId}/submit`;
    await this.executeRequest(path, "POST");
  }

  public async submitKybInformation(
    customerId: string,
    data: SubmitKybInformationRequest
  ): Promise<SubmitKybInformationResponse> {
    const path = `/api/v1/third-party-service/penny/customers/${customerId}/kyb`;
    return (await this.executeRequest(path, "POST", { kybSubmission: data })) as SubmitKybInformationResponse;
  }

  /**
   * Alfredpay: PUT …/customers/kyb — updates an existing (e.g. PENDING) KYB submission in place.
   * Alfredpay rejects a fresh POST while a submission is pending, so retries must go through here.
   * Docs: https://alfredpay.readme.io/v2.0/reference/kybcontroller_updatekyb-3
   */
  public async updateKybInformation(
    customerId: string,
    submissionId: string,
    data: SubmitKybInformationRequest
  ): Promise<void> {
    const path = "/api/v1/third-party-service/penny/customers/kyb";
    await this.executeRequest(path, "PUT", { customerId, kybUpdateSubmission: data, submissionId });
  }

  /**
   * Alfredpay: GET …/customers/{customerId}/kyb/details — returns the relate-person ids needed for KYB file uploads.
   * Docs: https://alfredpay.readme.io/v2.0/reference/kybcontroller_findcustomerandbusiness-1
   */
  public async getKybBusinessDetails(customerId: string): Promise<AlfredpayKybCustomerAndBusiness[]> {
    const path = `/api/v1/third-party-service/penny/customers/${customerId}/kyb/details`;
    return (await this.executeRequest<AlfredpayKybCustomerAndBusiness[]>(path, "GET")) ?? [];
  }

  public async submitKybFiles(
    customerId: string,
    submissionId: string,
    fileType: AlfredpayKybFileType,
    file: Blob
  ): Promise<void> {
    const formData = new FormData();
    formData.append("rawBody", await asAsciiNamedUpload(file));
    formData.append("fileType", fileType);

    const url = `${ALFREDPAY_BASE_URL}/api/v1/third-party-service/penny/customers/${customerId}/kyb/${submissionId}/files`;
    const response = await fetch(url, {
      body: formData,
      headers: {
        "api-key": this.apiKey,
        "api-secret": this.apiSecret
      },
      method: "POST"
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload KYB file: ${errorText}`);
    }
  }

  /**
   * Penny: POST …/customers/{customerId}/kyb/{idRelatedPerson}/files/relate-person
   * Path segment = Penny “Related Person ID” (from KYB submit response `relatedPersons[].id`, not the customerId).
   * Docs (typo in path name): https://alfredpay.readme.io/v2.0/reference/kybcontroller_submitkybfilerelateperson-3
   */
  public async submitKybRelatedPersonFiles(
    customerId: string,
    relatedPersonId: string,
    fileType: AlfredpayKybRelatedPersonFileType,
    file: Blob
  ): Promise<void> {
    const formData = new FormData();
    formData.append("rawBody", await asAsciiNamedUpload(file));
    formData.append("fileType", fileType);

    const url = `${ALFREDPAY_BASE_URL}/api/v1/third-party-service/penny/customers/${customerId}/kyb/${relatedPersonId}/files/relate-person`;
    const response = await fetch(url, {
      body: formData,
      headers: {
        "api-key": this.apiKey,
        "api-secret": this.apiSecret
      },
      method: "POST"
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload KYB related person file: ${errorText}`);
    }
  }

  public async sendKybSubmission(customerId: string, submissionId: string): Promise<void> {
    const path = `/api/v1/third-party-service/penny/customers/${customerId}/kyb/${submissionId}/submit`;
    await this.executeRequest(path, "PUT");
  }
}
