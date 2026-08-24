import * as forge from "node-forge";
import {
  AveniaDocumentUploadResponse,
  BRLA_API_KEY,
  BRLA_BASE_URL,
  BRLA_PRIVATE_KEY,
  DocumentUploadRequest,
  DocumentUploadResponse,
  LivenessDocumentResponse
} from "../..";
import logger from "../../logger";
import { ProviderHttpError } from "../providerHttpError";
import { Endpoint, EndpointMethod, EndpointRequestBody, EndpointResponse, Endpoints } from "./mappings";
import {
  aveniaDocumentResponseSchema,
  aveniaDocumentsSchema,
  aveniaDocumentUploadResponseSchema,
  aveniaImportKycTokenResponseSchema,
  aveniaKybAttemptStatusSchema,
  aveniaKybLevel1ResponseSchema,
  aveniaKycAttemptsSchema,
  aveniaLevel1ResponseSchema,
  aveniaLivenessDocumentResponseSchema,
  aveniaUboResponseSchema
} from "./schemas";
import {
  AccountLimitsResponse,
  AveniaAccountBalanceResponse,
  AveniaAccountInfoResponse,
  AveniaAccountType,
  AveniaDocumentGetResponse,
  AveniaDocumentResponse,
  AveniaImportKycTokenResponse,
  AveniaPayinTicket,
  AveniaPaymentMethod,
  AveniaPayoutTicket,
  AveniaPublicKeyResponse,
  AveniaQuoteResponse,
  AveniaSwapTicket,
  AveniaVerificationAttemptResponse,
  AveniaWebhookRegistration,
  AveniaWebhooksListResponse,
  BlockchainSendMethod,
  BrDocumentType,
  BrKybAttemptStatusResponse,
  BrKybLevel1Payload,
  BrlaCurrency,
  BrUboPayload,
  BrUboResponse,
  GetKycAttemptResponse,
  KybLevel1Response,
  KycLevel1Payload,
  KycLevel1Response,
  OnchainSwapQuoteParams,
  OnchainSwapTicketPayload,
  PayInQuoteParams,
  PayOutQuoteParams,
  PixInputTicketOutput,
  PixInputTicketPayload,
  PixKeyData,
  PixOutputTicketPayload
} from "./types";

interface CachedQuote {
  result: AveniaQuoteResponse;
  timestamp: number;
}

const QUOTE_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const QUOTE_CACHE_MAX_SIZE = 100; // Maximum number of cached entries
const PAGINATION_MAX_PAGES = 100;
export const AVENIA_PUBLIC_KEY_TIMEOUT_MS = 10_000;
// Bound on every signed API request. A hung connection would otherwise stall callers
// indefinitely — cron workers with waitForCompletion never run their next cycle.
export const BRLA_REQUEST_TIMEOUT_MS = 30_000;
const SENSITIVE_PROVIDER_RESPONSE = "Sensitive provider response omitted";

export interface BrlaRequestOptions {
  sensitiveBody?: boolean;
}

/**
 * Error thrown when an Avenia/BRLA HTTP request fails. See {@link ProviderHttpError} for the
 * carried fields and the message-format invariant.
 */
export class BrlaApiError extends ProviderHttpError {
  constructor(params: { status: number; endpoint: string; method: string; responseBody: string }) {
    super({ ...params, provider: "avenia" });
  }
}

export class BrlaApiService {
  private static instance: BrlaApiService;

  private apiKey: string;

  private privateKey: string;

  private quoteCache = new Map<string, CachedQuote>();

  private constructor() {
    if (!BRLA_API_KEY || !BRLA_PRIVATE_KEY) {
      throw new Error("BRLA_API_KEY or BRLA_PRIVATE_KEY not defined");
    }
    this.apiKey = BRLA_API_KEY;
    this.privateKey = BRLA_PRIVATE_KEY;
  }

  private getCachedQuote(cacheKey: string): AveniaQuoteResponse | undefined {
    const cached = this.quoteCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < QUOTE_CACHE_TTL_MS) {
      // Move to end for LRU tracking (Map maintains insertion order)
      this.quoteCache.delete(cacheKey);
      this.quoteCache.set(cacheKey, cached);
      logger.current.debug(`BrlaApiService: returning cached quote for key: ${cacheKey.slice(0, 80)}...`);
      return cached.result;
    }
    // Remove expired entry if present
    if (cached) {
      this.quoteCache.delete(cacheKey);
    }
    return undefined;
  }

  private setCachedQuote(cacheKey: string, result: AveniaQuoteResponse): void {
    const now = Date.now();

    // Evict expired entries first
    for (const [key, entry] of this.quoteCache) {
      if (now - entry.timestamp >= QUOTE_CACHE_TTL_MS) {
        this.quoteCache.delete(key);
      }
    }

    // If still at max capacity, evict the oldest (first) entries (LRU)
    while (this.quoteCache.size >= QUOTE_CACHE_MAX_SIZE) {
      const oldestKey = this.quoteCache.keys().next().value;
      this.quoteCache.delete(oldestKey as string);
    }

    this.quoteCache.set(cacheKey, { result, timestamp: now });
  }

  public static getInstance(): BrlaApiService {
    if (!BrlaApiService.instance) {
      BrlaApiService.instance = new BrlaApiService();
    }
    return BrlaApiService.instance;
  }

  public async sendRequest<E extends Endpoints, M extends EndpointMethod<E>>(
    endpoint: E,
    method: M,
    queryParams?: string,
    payload?: EndpointRequestBody<E, M>,
    pathParam?: string,
    requestOptions: BrlaRequestOptions = {}
  ): Promise<EndpointResponse<E, M>> {
    const timestamp = Date.now().toString();
    const body = payload ? JSON.stringify(payload) : "";
    let requestUri = endpoint as string;

    // Endpoints that carry a {placeholder} interpolate it; the rest append the segment.
    // Appending to a templated path would sign and request a literal "{attemptId}".
    if (pathParam) {
      const encodedPathParam = encodeURIComponent(pathParam);
      requestUri = requestUri.includes("{")
        ? requestUri.replace(/\{[^}]+\}/, encodedPathParam)
        : `${requestUri}/${encodedPathParam}`;
    }
    if (queryParams) {
      requestUri += `?${queryParams}`;
    }

    const stringToSign = timestamp + method + requestUri + body;

    const privateKey = forge.pki.privateKeyFromPem(this.privateKey);

    const md = forge.md.sha256.create();
    md.update(stringToSign, "utf8");

    const signatureBytes = privateKey.sign(md);

    const signatureBase64 = forge.util.encode64(signatureBytes);
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": this.apiKey,
      "X-API-Signature": signatureBase64,
      "X-API-Timestamp": timestamp
    };

    const options: RequestInit = {
      headers,
      method,
      signal: AbortSignal.timeout(BRLA_REQUEST_TIMEOUT_MS)
    };

    if (payload !== undefined) {
      options.body = body;
    }
    const fullUrl = `${BRLA_BASE_URL}${requestUri}`;
    if (requestOptions.sensitiveBody) {
      logger.current.debug(`Sending request to ${endpoint} with method ${method}; sensitive request details omitted`);
    } else {
      logger.current.debug(`Sending request to ${fullUrl} with method ${method} and payload:`, payload);
    }

    let response: Response;
    try {
      response = await fetch(fullUrl, options);
    } catch (error) {
      // Transport failure (DNS/timeout/connection reset) — no HTTP response. Surface it as a
      // provider error with status 0 so callers can normalize it to a 502 instead of a 500.
      throw new BrlaApiError({
        endpoint: endpoint as string,
        method: method as string,
        responseBody: requestOptions.sensitiveBody
          ? SENSITIVE_PROVIDER_RESPONSE
          : error instanceof Error
            ? error.message
            : String(error),
        status: 0
      });
    }

    if (response.status === 401) {
      throw new Error("Authorization error.");
    }

    if (!response.ok) {
      // BrlaApiError keeps the "status '<code>'. Error: <body>" message shape that the BRLA
      // controller parses, and additionally exposes the endpoint/method/status so the caller
      // can log precisely which Avenia call failed.
      throw new BrlaApiError({
        endpoint: endpoint as string,
        method: method as string,
        responseBody: requestOptions.sensitiveBody ? SENSITIVE_PROVIDER_RESPONSE : await response.text(),
        status: response.status
      });
    }
    try {
      return (await response.json()) as EndpointResponse<E, M>;
    } catch {
      return undefined as EndpointResponse<E, M>;
    }
  }

  public async getSubaccountUsedLimit(subaccountId: string): Promise<AccountLimitsResponse | undefined> {
    const query = `subAccountId=${encodeURIComponent(subaccountId)}`;
    return await this.sendRequest(Endpoint.AccountLimits, "GET", query);
  }

  public async createAveniaSubaccount(accountType: AveniaAccountType, name: string): Promise<{ id: string }> {
    const payload = {
      accountType,
      name
    };
    return await this.sendRequest(Endpoint.GetSubaccount, "POST", undefined, payload);
  }

  public async validatePixKey(pixKey: string): Promise<PixKeyData> {
    const query = `pixKey=${pixKey}&decodePixKey=true`;
    return await this.sendRequest(Endpoint.PixInfo, "GET", query);
  }

  public async getDocumentUploadUrls(
    documentType: BrDocumentType.SELFIE_FROM_LIVENESS,
    isDoubleSided: boolean,
    subAccountId: string
  ): Promise<LivenessDocumentResponse>;
  public async getDocumentUploadUrls(
    documentType: Exclude<BrDocumentType, BrDocumentType.SELFIE_FROM_LIVENESS>,
    isDoubleSided: boolean,
    subAccountId: string
  ): Promise<DocumentUploadResponse>;
  public async getDocumentUploadUrls(
    documentType: BrDocumentType,
    isDoubleSided: boolean,
    subAccountId: string
  ): Promise<AveniaDocumentUploadResponse>;
  public async getDocumentUploadUrls(
    documentType: BrDocumentType,
    isDoubleSided: boolean,
    subAccountId: string
  ): Promise<AveniaDocumentUploadResponse> {
    const payload: DocumentUploadRequest = {
      documentType,
      isDoubleSided
    };
    const query = `subAccountId=${encodeURIComponent(subAccountId)}`;
    const response = await this.sendRequest(Endpoint.Documents, "POST", query, payload);
    return documentType === BrDocumentType.SELFIE_FROM_LIVENESS
      ? aveniaLivenessDocumentResponseSchema.parse(response)
      : aveniaDocumentUploadResponseSchema.parse(response);
  }

  public async getUploadedDocuments(subAccountId: string): Promise<AveniaDocumentGetResponse> {
    const documents: AveniaDocumentGetResponse["documents"] = [];
    const seenCursors = new Set<string>();
    let pageCount = 0;
    let cursor: string | undefined;
    do {
      if (pageCount >= PAGINATION_MAX_PAGES) throw new Error("Avenia pagination exceeded the maximum page limit");
      const query = `subAccountId=${encodeURIComponent(subAccountId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const page = aveniaDocumentsSchema.parse(await this.sendRequest(Endpoint.Documents, "GET", query, undefined));
      pageCount++;
      documents.push(...page.documents);
      cursor = page.cursor;
      if (cursor && seenCursors.has(cursor)) throw new Error("Avenia document pagination repeated a cursor");
      if (cursor) seenCursors.add(cursor);
    } while (cursor);
    return { documents };
  }

  public async getUploadedDocument(documentId: string, subAccountId: string): Promise<AveniaDocumentResponse> {
    const query = `subAccountId=${encodeURIComponent(subAccountId)}`;
    return aveniaDocumentResponseSchema.parse(
      await this.sendRequest(Endpoint.GetDocument, "GET", query, undefined, documentId)
    );
  }

  public async createUbo(payload: BrUboPayload, subAccountId: string): Promise<BrUboResponse> {
    const query = `subAccountId=${encodeURIComponent(subAccountId)}`;
    return aveniaUboResponseSchema.parse(
      await this.sendRequest(Endpoint.Ubos, "POST", query, payload, undefined, { sensitiveBody: true })
    );
  }

  public async createPayInQuote(
    quoteParams: PayInQuoteParams,
    options: { useCache?: boolean } = {}
  ): Promise<AveniaQuoteResponse> {
    const urlSearchParams = new URLSearchParams({
      inputAmount: quoteParams.inputAmount,
      inputCurrency: quoteParams.inputCurrency,
      inputPaymentMethod: quoteParams.inputPaymentMethod,
      inputThirdParty: String(quoteParams.inputThirdParty),
      outputCurrency: quoteParams.outputCurrency,
      outputPaymentMethod: quoteParams.outputPaymentMethod,
      outputThirdParty: String(quoteParams.outputThirdParty)
    });

    if (quoteParams.subAccountId) {
      urlSearchParams.append("subAccountId", quoteParams.subAccountId);
    }
    if (quoteParams.blockchainSendMethod) {
      urlSearchParams.append("blockchainSendMethod", quoteParams.blockchainSendMethod);
    }

    const query = urlSearchParams.toString();
    const cacheKey = `payIn:${query}`;

    if (options.useCache) {
      const cached = this.getCachedQuote(cacheKey);
      if (cached) return cached;
    }

    const result = await this.sendRequest(Endpoint.FixedRateQuote, "GET", query);

    if (options.useCache) {
      this.setCachedQuote(cacheKey, result);
    }

    return result;
  }

  public async createPayOutQuote(
    quoteParams: PayOutQuoteParams,
    options: { useCache?: boolean } = {}
  ): Promise<AveniaQuoteResponse> {
    const urlSearchParams = new URLSearchParams({
      blockchainSendMethod: BlockchainSendMethod.PERMIT,
      inputCurrency: BrlaCurrency.BRLA, // Fixed to BRLA token
      inputPaymentMethod: AveniaPaymentMethod.INTERNAL, // Subtract from user's account
      inputThirdParty: String(false), // Fixed. We know it comes from the user's balance
      outputAmount: quoteParams.outputAmount,
      outputCurrency: quoteParams.outputCurrency ? quoteParams.outputCurrency : BrlaCurrency.BRL,
      outputPaymentMethod: quoteParams.outputPaymentMethod ? quoteParams.outputPaymentMethod : AveniaPaymentMethod.PIX,
      outputThirdParty: String(quoteParams.outputThirdParty)
    });

    if (quoteParams.subAccountId) {
      urlSearchParams.append("subAccountId", quoteParams.subAccountId);
    }

    const query = urlSearchParams.toString();
    const cacheKey = `payOut:${query}`;

    if (options.useCache) {
      const cached = this.getCachedQuote(cacheKey);
      if (cached) return cached;
    }

    const result = await this.sendRequest(Endpoint.FixedRateQuote, "GET", query);

    if (options.useCache) {
      this.setCachedQuote(cacheKey, result);
    }

    return result;
  }

  public async createOnchainSwapQuote(
    quoteParams: OnchainSwapQuoteParams,
    options: { useCache?: boolean } = {}
  ): Promise<AveniaQuoteResponse> {
    const query = new URLSearchParams({
      blockchainSendMethod: BlockchainSendMethod.PERMIT,
      inputAmount: quoteParams.inputAmount,
      inputCurrency: quoteParams.inputCurrency, // Subtract from main account
      inputPaymentMethod: AveniaPaymentMethod.INTERNAL, // Fixed. We know it comes from the our balance
      inputThirdParty: String(false),
      outputCurrency: quoteParams.outputCurrency,
      outputPaymentMethod: quoteParams.outputPaymentMethod ?? AveniaPaymentMethod.POLYGON,
      outputThirdParty: String(false) // Fixed. We know it goes to our Moonbeam account.
    }).toString();
    const cacheKey = `onchainSwap:${query}`;

    if (options.useCache) {
      const cached = this.getCachedQuote(cacheKey);
      if (cached) return cached;
    }

    const result = await this.sendRequest(Endpoint.FixedRateQuote, "GET", query);

    if (options.useCache) {
      this.setCachedQuote(cacheKey, result);
    }

    return result;
  }

  public async createPixInputTicket(payload: PixInputTicketPayload, subAccountId: string): Promise<PixInputTicketOutput> {
    const query = `subAccountId=${encodeURIComponent(subAccountId)}`;
    const response = await this.sendRequest(Endpoint.Tickets, "POST", query, payload);

    if ("brCode" in response) {
      return response;
    }
    // To satisfy TypeScript
    throw new Error("Invalid response from Avenia API for createPixInputTicket");
  }

  public async createPixOutputTicket(
    payload: PixOutputTicketPayload | PixInputTicketPayload,
    subAccountId: string
  ): Promise<{ id: string }> {
    const query = `subAccountId=${encodeURIComponent(subAccountId)}`;
    const response = await this.sendRequest(Endpoint.Tickets, "POST", query, payload);

    if ("brlPixInputInfo" in response) {
      throw new Error("Invalid response from Avenia API for createPixOutputTicket");
    }
    return response;
  }

  public async createOnchainSwapTicket(payload: OnchainSwapTicketPayload): Promise<{ id: string }> {
    const response = await this.sendRequest(Endpoint.Tickets, "POST", undefined, payload);
    if ("id" in response) {
      return response;
    }
    throw new Error("Invalid response from Avenia API for createOnchainSwapTicket");
  }

  public async subaccountInfo(subaccountId: string): Promise<AveniaAccountInfoResponse | undefined> {
    const query = `subAccountId=${encodeURIComponent(subaccountId)}`;
    return await this.sendRequest(Endpoint.AccountInfo, "GET", query);
  }

  public async submitKycLevel1(payload: KycLevel1Payload): Promise<KycLevel1Response> {
    const query = `subAccountId=${encodeURIComponent(payload.subAccountId)}`;
    return aveniaLevel1ResponseSchema.parse(
      await this.sendRequest(Endpoint.Level1Api, "POST", query, payload, undefined, { sensitiveBody: true })
    );
  }

  public async submitKybLevel1(payload: BrKybLevel1Payload, subAccountId: string): Promise<KycLevel1Response> {
    const query = `subAccountId=${encodeURIComponent(subAccountId)}`;
    return aveniaLevel1ResponseSchema.parse(
      await this.sendRequest(Endpoint.Level1Api, "POST", query, payload, undefined, { sensitiveBody: true })
    );
  }

  public async importKycToken(importToken: string, subAccountId: string): Promise<AveniaImportKycTokenResponse> {
    const query = `subAccountId=${encodeURIComponent(subAccountId)}`;
    const payload = { importToken };
    return aveniaImportKycTokenResponseSchema.parse(
      await this.sendRequest(Endpoint.ImportKycToken, "POST", query, payload, undefined, { sensitiveBody: true })
    );
  }

  public async getKycAttempts(subAccountId: string): Promise<GetKycAttemptResponse> {
    const attempts: GetKycAttemptResponse["attempts"] = [];
    const seenCursors = new Set<string>();
    let pageCount = 0;
    let cursor: string | undefined;
    do {
      if (pageCount >= PAGINATION_MAX_PAGES) throw new Error("Avenia pagination exceeded the maximum page limit");
      const query = `subAccountId=${encodeURIComponent(subAccountId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const page = aveniaKycAttemptsSchema.parse(await this.sendRequest(Endpoint.GetKycAttempt, "GET", query, undefined));
      pageCount++;
      attempts.push(...page.attempts);
      cursor = page.cursor;
      if (cursor && seenCursors.has(cursor)) throw new Error("Avenia KYC attempt pagination repeated a cursor");
      if (cursor) seenCursors.add(cursor);
    } while (cursor);
    return { attempts };
  }

  /**
   * Initiates KYB Level 1 verification process using the Web SDK
   * @param subAccountId The subaccount ID
   * @returns URLs for the KYB verification process
   */
  public async initiateKybLevel1(subAccountId: string): Promise<KybLevel1Response> {
    const query = `subAccountId=${encodeURIComponent(subAccountId)}`;
    // Avenia requires the field to be present but ignores its value for the Web SDK flow.
    const payload = { redirectUrl: "" };
    return aveniaKybLevel1ResponseSchema.parse(await this.sendRequest(Endpoint.KybLevel1WebSdk, "POST", query, payload));
  }

  /** Gets an individual or company verification attempt by its exact provider ID. */
  public async getVerificationAttemptStatus(
    attemptId: string,
    subAccountId?: string
  ): Promise<AveniaVerificationAttemptResponse> {
    const query = subAccountId ? `subAccountId=${encodeURIComponent(subAccountId)}` : undefined;
    return aveniaKybAttemptStatusSchema.parse(
      await this.sendRequest(Endpoint.GetKybAttempt, "GET", query, undefined, attemptId)
    );
  }

  public async getKybAttemptStatus(attemptId: string, subAccountId?: string): Promise<BrKybAttemptStatusResponse> {
    return this.getVerificationAttemptStatus(attemptId, subAccountId);
  }

  public async listWebhooks(): Promise<AveniaWebhooksListResponse> {
    return await this.sendRequest(Endpoint.Webhooks, "GET");
  }

  public async createWebhook(webhookUrl: string, subscriptions: string[]): Promise<AveniaWebhookRegistration> {
    return await this.sendRequest(Endpoint.Webhooks, "POST", undefined, { subscriptions, webhookUrl });
  }

  public async updateWebhook(webhookId: string, webhookUrl: string, subscriptions: string[]): Promise<void> {
    await this.sendRequest(Endpoint.Webhooks, "PATCH", undefined, { subscriptions, webhookId, webhookUrl });
  }

  public async deleteWebhook(webhookId: string): Promise<void> {
    await this.sendRequest(Endpoint.Webhooks, "DELETE", undefined, undefined, webhookId);
  }

  /**
   * Avenia's webhook-signing public key. Unauthenticated, and Avenia's guide warns it
   * rotates, so it is fetched rather than pinned in config.
   */
  // eslint-disable-next-line class-methods-use-this
  public async getAveniaPublicKey(): Promise<string> {
    const response = await fetch(`${BRLA_BASE_URL}/v2/public-key`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(AVENIA_PUBLIC_KEY_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Avenia public key: status '${response.status}'`);
    }

    const { publicKey } = (await response.json()) as AveniaPublicKeyResponse;
    if (!publicKey) {
      throw new Error("Avenia public key response contained no key");
    }

    return publicKey;
  }

  public async getAccountBalance(subAccountId: string): Promise<AveniaAccountBalanceResponse> {
    const query = `subAccountId=${encodeURIComponent(subAccountId)}`;
    return await this.sendRequest(Endpoint.Balances, "GET", query);
  }

  public async getMainAccountBalance(): Promise<AveniaAccountBalanceResponse> {
    return await this.sendRequest(Endpoint.Balances, "GET");
  }

  public async getAveniaPayoutTicket(ticketId: string, subAccountId: string): Promise<AveniaPayoutTicket> {
    const query = `subAccountId=${encodeURIComponent(subAccountId)}`;
    const aveniaTicketsQueryResponse = await this.sendRequest(Endpoint.Tickets, "GET", query, undefined, ticketId);

    if ("ticket" in aveniaTicketsQueryResponse && "brazilianFiatReceiverInfo" in aveniaTicketsQueryResponse.ticket) {
      return aveniaTicketsQueryResponse.ticket;
    }
    throw new Error("Invalid response from Avenia API for getAveniaPayoutTicket");
  }

  public async getAveniaPayinTickets(subAccountId: string): Promise<AveniaPayinTicket[]> {
    const query = `subAccountId=${encodeURIComponent(subAccountId)}`;
    const aveniaTicketsQueryResponse = await this.sendRequest(Endpoint.Tickets, "GET", query, undefined);

    if ("tickets" in aveniaTicketsQueryResponse) {
      return aveniaTicketsQueryResponse.tickets.filter(
        (ticket): ticket is AveniaPayinTicket => "brlPixInputInfo" in ticket || "brazilianFiatSenderInfo" in ticket
      );
    }
    throw new Error("Invalid response from Avenia API for getAveniaPayinTickets");
  }

  public async getAveniaSwapTicket(ticketId: string): Promise<AveniaSwapTicket> {
    const aveniaTicketsQueryResponse = await this.sendRequest(Endpoint.Tickets, "GET", undefined, undefined, ticketId);
    if ("ticket" in aveniaTicketsQueryResponse) {
      return aveniaTicketsQueryResponse.ticket as AveniaSwapTicket;
    }

    throw new Error("Invalid response from Avenia API for getAveniaSwapTicket");
  }
}
