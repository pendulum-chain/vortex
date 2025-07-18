import { BrlaKYCDocType } from "@packages/shared";
import { BRLA_BASE_URL, BRLA_LOGIN_PASSWORD, BRLA_LOGIN_USERNAME } from "../../../constants/constants";
import { Endpoint, EndpointMapping, Endpoints, Methods } from "./mappings";
import {
  DepositLog,
  FastQuoteQueryParams,
  FastQuoteResponse,
  KycLevel2Response,
  KycRetryPayload,
  OfframpPayload,
  OnchainLog,
  OnrampPayload,
  PixKeyData,
  RegisterSubaccountPayload,
  SubaccountData,
  SwapPayload,
  UsedLimitData
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
    payload?: EndpointMapping[E][M]["body"]
  ): Promise<EndpointMapping[E][M]["response"]> {
    if (!this.token) {
      await this.login();
    }
    let fullUrl = `${BRLA_BASE_URL}${endpoint}`;

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

  public async getSubaccount(taxId: string): Promise<SubaccountData | undefined> {
    const query = `taxId=${encodeURIComponent(taxId)}`;
    const response = await this.sendRequest(Endpoint.Subaccounts, "GET", query);
    return response.subaccounts[0];
  }

  public async getSubaccountUsedLimit(subaccountId: string): Promise<UsedLimitData | undefined> {
    const query = `subaccountId=${encodeURIComponent(subaccountId)}`;
    return await this.sendRequest(Endpoint.UsedLimit, "GET", query);
  }

  public async triggerOfframp(subaccountId: string, offrampParams: OfframpPayload): Promise<{ id: string }> {
    const query = `subaccountId=${encodeURIComponent(subaccountId)}`;
    return await this.sendRequest(Endpoint.PayOut, "POST", query, offrampParams);
  }

  public async createSubaccount(registerSubaccountPayload: RegisterSubaccountPayload): Promise<{ id: string }> {
    return await this.sendRequest(Endpoint.Subaccounts, "POST", undefined, registerSubaccountPayload);
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

  public async createFastQuote(fastQuoteParams: FastQuoteQueryParams): Promise<FastQuoteResponse> {
    const query = [
      `subaccountId=${encodeURIComponent(fastQuoteParams.subaccountId)}`,
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

  public async startKYC2(subaccountId: string, documentType: BrlaKYCDocType): Promise<KycLevel2Response> {
    const query = `subaccountId=${encodeURIComponent(subaccountId)}`;
    return await this.sendRequest(Endpoint.KycLevel2, "POST", query, { documentType });
  }

  public async retryKYC(subaccountId: string, retryKycPayload: KycRetryPayload): Promise<unknown> {
    const query = `subaccountId=${encodeURIComponent(subaccountId)}`;
    return await this.sendRequest(Endpoint.KycRetry, "POST", query, retryKycPayload);
  }
}
