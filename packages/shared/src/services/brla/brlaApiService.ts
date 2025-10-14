import * as forge from "node-forge";
import { BRLA_API_KEY, BRLA_BASE_URL, BRLA_PRIVATE_KEY, DocumentUploadRequest, DocumentUploadResponse } from "../..";
import logger from "../../logger";
import { Endpoint, EndpointMapping, Endpoints, Methods } from "./mappings";
import {
  AccountLimitsResponse,
  AveniaAccountBalanceResponse,
  AveniaAccountInfoResponse,
  AveniaAccountType,
  AveniaDocumentGetResponse,
  AveniaDocumentType,
  AveniaPayinTicket,
  AveniaPaymentMethod,
  AveniaPayoutTicket,
  AveniaQuoteResponse,
  BlockchainSendMethod,
  BrlaCurrency,
  GetKycAttemptResponse,
  KybAttemptStatusResponse,
  KybLevel1Response,
  KycLevel1Payload,
  KycLevel1Response,
  PayInQuoteParams,
  PayOutQuoteParams,
  PixInputTicketOutput,
  PixInputTicketPayload,
  PixKeyData,
  PixOutputTicketPayload
} from "./types";

export class BrlaApiService {
  private static instance: BrlaApiService;

  private apiKey: string;

  private privateKey: string;

  private constructor() {
    if (!BRLA_API_KEY || !BRLA_PRIVATE_KEY) {
      throw new Error("BRLA_API_KEY or BRLA_PRIVATE_KEY not defined");
    }
    this.apiKey = BRLA_API_KEY;
    this.privateKey = BRLA_PRIVATE_KEY;
  }

  public static getInstance(): BrlaApiService {
    if (!BrlaApiService.instance) {
      BrlaApiService.instance = new BrlaApiService();
    }
    return BrlaApiService.instance;
  }

  public async sendRequest<M extends Methods, E extends Endpoints>(
    endpoint: E,
    method: M,
    queryParams?: string,
    payload?: EndpointMapping[E][M]["body"],
    pathParam?: string
  ): Promise<EndpointMapping[E][M]["response"]> {
    const timestamp = Date.now().toString();
    const body = payload ? JSON.stringify(payload) : "";
    let requestUri = endpoint as string;

    if (pathParam) {
      requestUri += `/${pathParam}`;
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
      method
    };

    if (payload !== undefined) {
      options.body = body;
    }
    const fullUrl = `${BRLA_BASE_URL}${requestUri}`;
    logger.current.info(`Sending request to ${fullUrl} with method ${method} and payload:`, payload);

    const response = await fetch(fullUrl, options);

    if (response.status === 401) {
      throw new Error("Authorization error.");
    }

    if (!response.ok) {
      // This format matters and is used in the BRLA controller.
      throw new Error(`Request failed with status '${response.status}'. Error: ${await response.text()}`);
    }
    try {
      return await response.json();
    } catch {
      return undefined;
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
    documentType: AveniaDocumentType,
    isDoubleSided: boolean,
    subAccountId: string
  ): Promise<DocumentUploadResponse> {
    const payload: DocumentUploadRequest = {
      documentType,
      isDoubleSided
    };
    const query = `subAccountId=${encodeURIComponent(subAccountId)}`;
    return await this.sendRequest(Endpoint.Documents, "POST", query, payload);
  }

  public async getUploadedDocuments(subAccountId: string): Promise<AveniaDocumentGetResponse> {
    const query = `subAccountId=${encodeURIComponent(subAccountId)}`;
    return await this.sendRequest(Endpoint.Documents, "GET", query, undefined);
  }

  public async createPayInQuote(quoteParams: PayInQuoteParams): Promise<AveniaQuoteResponse> {
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
    const query = urlSearchParams.toString();
    return await this.sendRequest(Endpoint.FixedRateQuote, "GET", query);
  }

  public async createPayOutQuote(quoteParams: PayOutQuoteParams): Promise<AveniaQuoteResponse> {
    const urlSearchParams = new URLSearchParams({
      blockchainSendMethod: BlockchainSendMethod.PERMIT,
      inputCurrency: BrlaCurrency.BRLA, // Fixed to BRLA token
      inputPaymentMethod: AveniaPaymentMethod.INTERNAL, // Subtract from user's account
      inputThirdParty: String(false), // Fixed. We know it comes from the user's balance
      outputAmount: quoteParams.outputAmount, // Fixed to FIAT out
      outputCurrency: BrlaCurrency.BRL,
      outputPaymentMethod: AveniaPaymentMethod.PIX,
      outputThirdParty: String(quoteParams.outputThirdParty)
    });

    if (quoteParams.subAccountId) {
      urlSearchParams.append("subAccountId", quoteParams.subAccountId);
    }

    const query = urlSearchParams.toString();
    return await this.sendRequest(Endpoint.FixedRateQuote, "GET", query);
  }

  public async createPixInputTicket(payload: PixInputTicketPayload, subAccountId: string): Promise<PixInputTicketOutput> {
    const query = `subAccountId=${encodeURIComponent(subAccountId)}`;
    const response = await this.sendRequest(Endpoint.Tickets, "POST", query, payload);
    console.log("createPixInputTicket response", response);

    if ("brCode" in response) {
      return response;
    }
    // To satisfy TypeScript
    throw new Error("Invalid response from Avenia API for createPixInputTicket");
  }

  public async createPixOutputTicket(payload: PixOutputTicketPayload, subAccountId: string): Promise<{ id: string }> {
    const query = `subAccountId=${encodeURIComponent(subAccountId)}`;
    const response = await this.sendRequest(Endpoint.Tickets, "POST", query, payload);
    // TODO not sure what the return object is, we need to check if our current assumption is correct
    if ("brlPixInputInfo" in response) {
      throw new Error("Invalid response from Avenia API for createPixOutputTicket");
    }
    return response;
  }

  public async subaccountInfo(subaccountId: string): Promise<AveniaAccountInfoResponse | undefined> {
    const query = `subAccountId=${encodeURIComponent(subaccountId)}`;
    return await this.sendRequest(Endpoint.AccountInfo, "GET", query);
  }

  public async submitKycLevel1(payload: KycLevel1Payload): Promise<KycLevel1Response> {
    const query = `subAccountId=${encodeURIComponent(payload.subAccountId)}`;
    return await this.sendRequest(Endpoint.KycLevel1, "POST", query, payload);
  }

  public async getKycAttempts(subAccountId: string): Promise<GetKycAttemptResponse> {
    const query = `subAccountId=${encodeURIComponent(subAccountId)}`;
    return await this.sendRequest(Endpoint.GetKycAttempt, "GET", query, undefined);
  }

  /**
   * Initiates KYB Level 1 verification process using the Web SDK
   * @param subAccountId The subaccount ID
   * @returns URLs for the KYB verification process
   */
  public async initiateKybLevel1(subAccountId: string): Promise<KybLevel1Response> {
    const query = `subAccountId=${encodeURIComponent(subAccountId)}`;
    return await this.sendRequest(Endpoint.KybLevel1WebSdk, "POST", query, undefined);
  }

  /**
   * Gets the status of a KYB attempt
   * @param attemptId The KYB attempt ID
   * @returns The KYB attempt status
   */
  public async getKybAttemptStatus(attemptId: string): Promise<KybAttemptStatusResponse> {
    return await this.sendRequest(Endpoint.GetKybAttempt, "GET", undefined, undefined, attemptId);
  }

  public async getAccountBalance(subAccountId: string): Promise<AveniaAccountBalanceResponse> {
    const query = `subAccountId=${encodeURIComponent(subAccountId)}`;
    return await this.sendRequest(Endpoint.Balances, "GET", query);
  }

  public async getAveniaPayoutTicket(ticketId: string, subAccountId: string): Promise<AveniaPayoutTicket> {
    const query = `subAccountId=${encodeURIComponent(subAccountId)}`;
    const aveniaTicketsQueryResponse = await this.sendRequest(Endpoint.Tickets, "GET", query, undefined, ticketId);

    if ("ticket" in aveniaTicketsQueryResponse && "brlPixOutputInfo" in aveniaTicketsQueryResponse.ticket) {
      return aveniaTicketsQueryResponse.ticket;
    }
    throw new Error("Invalid response from Avenia API for getAveniaPayoutTicket");
  }

  public async getAveniaPayinTickets(subAccountId: string): Promise<AveniaPayinTicket[]> {
    const query = `subAccountId=${encodeURIComponent(subAccountId)}`;
    const aveniaTicketsQueryResponse = await this.sendRequest(Endpoint.Tickets, "GET", query, undefined);

    if ("tickets" in aveniaTicketsQueryResponse) {
      return aveniaTicketsQueryResponse.tickets.filter((ticket): ticket is AveniaPayinTicket => "brlPixInputInfo" in ticket);
    }
    throw new Error("Invalid response from Avenia API for getAveniaPayinTickets");
  }
}
