import { createPrivateKey, sign } from "crypto";
import * as forge from "node-forge";
import {
  BRLA_API_KEY,
  BRLA_BASE_URL,
  BRLA_PRIVATE_KEY,
  CreateAveniaSubaccountRequest,
  DocumentUploadRequest,
  DocumentUploadResponse,
  SwapLog
} from "../..";
import logger from "../../logger";
import { Endpoint, EndpointMapping, Endpoints, Methods } from "./mappings";
import {
  AccountLimitsResponse,
  AveniaAccountInfoResponse,
  AveniaAccountType,
  AveniaDocumentType,
  AveniaQuoteResponse,
  AveniaSubaccount,
  BlockchainSendMethod,
  BrlaCurrency,
  BrlaPaymentMethod,
  DepositLog,
  FastQuoteQueryParams,
  FastQuoteResponse,
  GetKycAttemptResponse,
  KycLevel1Payload,
  KycLevel1Response,
  KycLevel2Response,
  KycRetryPayload,
  OfframpPayload,
  OnchainLog,
  OnrampPayload,
  PayInQuoteParams,
  PayOutQuoteParams,
  PixInputTicketOutput,
  PixInputTicketPayload,
  PixKeyData,
  PixOutputTicketOutput,
  PixOutputTicketPayload,
  RegisterSubaccountPayload,
  SwapPayload
} from "./types";
import { Event } from "./webhooks";

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

  public async transferBrlaToDestination(
    destination: string,
    amount: Big,
    chain: "Polygon" // For now, we only need to care about Polygon
  ) {
    const amountInCents = amount.mul(100).toFixed(0, 0); // Convert to cents as BRLA API expects amounts in cents
    const payload = {
      chain,
      exactOutput: true,
      inputCoin: "BRLA",
      outputCoin: "BRLA",
      to: destination,
      value: Number(amountInCents) // Assuming BRLA is the input and output coin for this transfer
    };

    return await this.sendRequest(Endpoint.OnChainOut, "POST", undefined, payload);
  }

  public async getSubaccount(subaccountId: string): Promise<AveniaSubaccount> {
    return await this.sendRequest(Endpoint.GetSubaccount, "GET", undefined, undefined, subaccountId);
  }

  public async getSubaccountUsedLimit(subaccountId: string): Promise<AccountLimitsResponse | undefined> {
    const query = `subAccountId=${encodeURIComponent(subaccountId)}`;
    return await this.sendRequest(Endpoint.AccountLimits, "GET", query);
  }

  public async createSubaccount(registerSubaccountPayload: RegisterSubaccountPayload): Promise<{ id: string }> {
    return await this.sendRequest(Endpoint.Subaccounts, "POST", undefined, registerSubaccountPayload);
  }

  public async createAveniaSubaccount(accountType: AveniaAccountType, name: string): Promise<{ id: string }> {
    const payload = {
      accountType,
      name
    };
    return await this.sendRequest(Endpoint.GetSubaccount, "POST", undefined, payload);
  }

  public async getAllEventsByUser(userId: string, subscription: string | null = null): Promise<Event[] | undefined> {
    let query = `subaccountId=${encodeURIComponent(userId)}`;
    if (subscription) {
      query += `&subscription=${encodeURIComponent(subscription)}`;
    }
    const response = await this.sendRequest(Endpoint.WebhookEvents, "GET", query);
    return response.events;
  }

  public async acknowledgeEvents(ids: string[]): Promise<void> {
    return await this.sendRequest(Endpoint.WebhookEvents, "PATCH", undefined, { ids });
  }

  public async generateBrCode(onrampPayload: OnrampPayload): Promise<{ brCode: string }> {
    const query = `subaccountId=${encodeURIComponent(onrampPayload.subaccountId)}&amount=${
      onrampPayload.amount
    }&referenceLabel=${onrampPayload.referenceLabel}`;
    return await this.sendRequest(Endpoint.BrCode, "GET", query);
  }

  public async validatePixKey(pixKey: string): Promise<PixKeyData> {
    // const query = `pixKey=${encodeURIComponent(pixKey)}`;
    return { bankName: "", name: "", taxId: pixKey };
    // return await this.sendRequest(Endpoint.PixInfo, 'GET', query);
  }

  public async getPayInHistory(userId: string): Promise<DepositLog[]> {
    const query = `subaccountId=${encodeURIComponent(userId)}`;
    return (await this.sendRequest(Endpoint.PixHistory, "GET", query)).depositsLogs;
  }

  public async getSwapHistory(userId: string | undefined): Promise<SwapLog[]> {
    const query = userId ? `subaccountId=${encodeURIComponent(userId)}` : undefined;
    return (await this.sendRequest(Endpoint.SwapHistory, "GET", query)).swapLogs;
  }

  public async createFastQuote(fastQuoteParams: FastQuoteQueryParams): Promise<FastQuoteResponse> {
    const query = [
      fastQuoteParams.subaccountId ? `subaccountId=${encodeURIComponent(fastQuoteParams.subaccountId)}` : undefined,
      `operation=${fastQuoteParams.operation}`,
      `amount=${fastQuoteParams.amount.toString()}`,
      `inputCoin=${fastQuoteParams.inputCoin}`,
      `outputCoin=${fastQuoteParams.outputCoin}`,
      `chain=${fastQuoteParams.chain}`,
      `fixOutput=${fastQuoteParams.fixOutput.toString()}`
    ].join("&");
    return await this.sendRequest(Endpoint.FastQuote, "GET", query);
  }

  public async swapRequest(swapPayload: SwapPayload): Promise<{ id: string }> {
    return await this.sendRequest(Endpoint.Swap, "POST", undefined, swapPayload);
  }

  public async getOnChainHistoryOut(userId: string): Promise<OnchainLog[]> {
    const query = `subAccountId=${encodeURIComponent(userId)}`;
    return (await this.sendRequest(Endpoint.OnChainHistoryOut, "GET", query)).onchainLogs;
  }

  public async getDocumentUploadUrls(
    documentType: AveniaDocumentType,
    isDoubleSided: boolean
  ): Promise<DocumentUploadResponse> {
    const payload: DocumentUploadRequest = {
      documentType,
      isDoubleSided
    };
    return await this.sendRequest(Endpoint.Documents, "POST", undefined, payload);
  }

  public async retryKYC(subaccountId: string, retryKycPayload: KycRetryPayload): Promise<unknown> {
    const query = `subAccountId=${encodeURIComponent(subaccountId)}`;
    return await this.sendRequest(Endpoint.KycRetry, "POST", query, retryKycPayload);
  }

  public async createPayInQuote(quoteParams: PayInQuoteParams): Promise<AveniaQuoteResponse> {
    const query = new URLSearchParams({
      inputAmount: quoteParams.inputAmount,
      inputCurrency: quoteParams.inputCurrency,
      inputPaymentMethod: quoteParams.inputPaymentMethod,
      inputThirdParty: String(quoteParams.inputThirdParty),
      outputCurrency: quoteParams.outputCurrency,
      outputPaymentMethod: quoteParams.outputPaymentMethod,
      outputThirdParty: String(quoteParams.outputThirdParty),
      subAccountId: quoteParams.subAccountId
    }).toString();
    return await this.sendRequest(Endpoint.FixedRateQuote, "GET", query);
  }

  public async createPayOutQuote(quoteParams: PayOutQuoteParams): Promise<AveniaQuoteResponse> {
    const query = new URLSearchParams({
      blockchainSendMethod: BlockchainSendMethod.PERMIT,
      inputCurrency: BrlaCurrency.BRLA, // Fixed to BRLA token
      inputPaymentMethod: BrlaPaymentMethod.INTERNAL, // Subtract from user's account
      inputThirdParty: String(false), // Fixed. We know it comes from the user's balance
      outputAmount: quoteParams.outputAmount, // Fixed to FIAT out
      outputCurrency: BrlaCurrency.BRL,
      outputPaymentMethod: BrlaPaymentMethod.PIX,
      outputThirdParty: String(quoteParams.outputThirdParty)
    }).toString();
    return await this.sendRequest(Endpoint.FixedRateQuote, "GET", query);
  }

  public async createPixInputTicket(payload: PixInputTicketPayload): Promise<PixInputTicketOutput> {
    const response = await this.sendRequest(Endpoint.Tickets, "POST", undefined, payload);
    if ("brlPixInputInfo" in response) {
      return response;
    }
    // To satisfy TypeScript
    throw new Error("Invalid response from BRLA API for createPixInputTicket");
  }

  public async createPixOutputTicket(payload: PixOutputTicketPayload): Promise<{ id: string }> {
    const response = await this.sendRequest(Endpoint.Tickets, "POST", undefined, payload);
    if ("brlPixInputInfo" in response) {
      throw new Error("Invalid response from BRLA API for createPixOutputTicket");
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

  public async getKycAttempt(attemptId: string): Promise<GetKycAttemptResponse> {
    return await this.sendRequest(Endpoint.GetKycAttempt, "GET", undefined, undefined, attemptId);
  }
}
