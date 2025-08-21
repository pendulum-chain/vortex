import {
  BRLA_BASE_URL,
  BRLA_LOGIN_PASSWORD,
  BRLA_LOGIN_USERNAME,
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
  AveniaSubaccount,
  BlockchainSendMethod,
  BrlaCurrency,
  BrlaPaymentMethod,
  DepositLog,
  FastQuoteQueryParams,
  FastQuoteResponse,
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
  QuoteResponse,
  RegisterSubaccountPayload,
  SwapPayload
} from "./types";
import { Event } from "./webhooks";

export class BrlaApiService {
  private static instance: BrlaApiService;

  private token: string | null = null;

  private brlaBusinessUsername: string;

  private brlaBusinessPassword: string;

  private readonly loginUrl: string = `${BRLA_BASE_URL}/login`;

  private constructor() {
    if (!BRLA_LOGIN_USERNAME || !BRLA_LOGIN_PASSWORD) {
      throw new Error("BRLA_LOGIN_USERNAME or BRLA_LOGIN_PASSWORD not defined");
    }
    this.brlaBusinessUsername = BRLA_LOGIN_USERNAME;
    this.brlaBusinessPassword = BRLA_LOGIN_PASSWORD;
  }

  public static getInstance(): BrlaApiService {
    if (!BrlaApiService.instance) {
      BrlaApiService.instance = new BrlaApiService();
    }
    return BrlaApiService.instance;
  }

  private async login(): Promise<void> {
    const response = await fetch(this.loginUrl, {
      body: JSON.stringify({
        email: this.brlaBusinessUsername,
        password: this.brlaBusinessPassword
      }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      throw new Error(`Login failed with status ${response.status}`);
    }

    const token = (await response.json()).accessToken;

    if (!token) {
      throw new Error("No token returned from login.");
    }

    this.token = token;
  }

  public async sendRequest<M extends Methods, E extends Endpoints>(
    endpoint: E,
    method: M,
    queryParams?: string,
    payload?: EndpointMapping[E][M]["body"],
    pathParam?: string
  ): Promise<EndpointMapping[E][M]["response"]> {
    if (!this.token) {
      await this.login();
    }
    let fullUrl = `${BRLA_BASE_URL}${endpoint}`;

    if (pathParam) {
      fullUrl += `/${pathParam}`;
    }

    if (queryParams) {
      fullUrl += `?${queryParams}`;
    }
    const buildOptions = () => {
      const options: RequestInit = {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json"
        },
        method
      };

      if (payload !== undefined) {
        options.body = JSON.stringify(payload);
      }
      return options;
    };

    logger.current.info(`Sending request to ${fullUrl} with method ${method} and payload:`, payload);

    let response = await fetch(fullUrl, buildOptions());

    if (response.status === 401) {
      await this.login();
      response = await fetch(fullUrl, buildOptions());

      if (response.status === 401) {
        throw new Error("Authorization error after re-login.");
      }
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

  public async getSubaccount(subaccountId: string): Promise<AveniaSubaccount | undefined> {
    return await this.sendRequest(Endpoint.GetSubaccount, "GET", undefined, undefined, subaccountId);
  }

  public async getSubaccountUsedLimit(subaccountId: string): Promise<AccountLimitsResponse | undefined> {
    const query = `subaccountId=${encodeURIComponent(subaccountId)}`;
    return await this.sendRequest(Endpoint.AccountLimits, "GET", query);
  }

  public async createSubaccount(registerSubaccountPayload: RegisterSubaccountPayload): Promise<{ id: string }> {
    return await this.sendRequest(Endpoint.Subaccounts, "POST", undefined, registerSubaccountPayload);
  }

  public async createAveniaSubaccount(accountType: AveniaAccountType, name: string): Promise<{ id: string }> {
    const payload: CreateAveniaSubaccountRequest = {
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
    const query = `subaccountId=${encodeURIComponent(userId)}`;
    return (await this.sendRequest(Endpoint.OnChainHistoryOut, "GET", query)).onchainLogs;
  }

  public async getDocumentUploadUrls(
    subaccountId: string,
    documentType: AveniaDocumentType,
    isDoubleSided: boolean
  ): Promise<DocumentUploadResponse> {
    const payload: DocumentUploadRequest = {
      documentType,
      isDoubleSided
    };
    const query = `subaccountId=${encodeURIComponent(subaccountId)}`;
    return await this.sendRequest(Endpoint.Documents, "POST", query, payload);
  }

  public async retryKYC(subaccountId: string, retryKycPayload: KycRetryPayload): Promise<unknown> {
    const query = `subaccountId=${encodeURIComponent(subaccountId)}`;
    return await this.sendRequest(Endpoint.KycRetry, "POST", query, retryKycPayload);
  }

  public async createPayInQuote(quoteParams: PayInQuoteParams): Promise<QuoteResponse> {
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

  public async createPayOutQuote(quoteParams: PayOutQuoteParams): Promise<QuoteResponse> {
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
    const query = `subaccountId=${encodeURIComponent(subaccountId)}`;
    return await this.sendRequest(Endpoint.AccountInfo, "GET", query);
  }

  public async submitKycLevel1(payload: KycLevel1Payload): Promise<KycLevel1Response> {
    return await this.sendRequest(Endpoint.KycLevel1, "POST", undefined, payload);
  }
}
