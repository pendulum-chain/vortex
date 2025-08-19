import {
  AccountLimitsResponse,
  AveniaSubaccount,
  DepositLog,
  FastQuoteResponse,
  KycLevel2Payload,
  KycLevel2Response,
  KycRetryPayload,
  OfframpPayload,
  OnChainOutPayload,
  OnchainLog,
  PixInputTicketOutput,
  PixInputTicketPayload,
  PixKeyData,
  PixOutputTicketPayload,
  QuoteResponse,
  RegisterSubaccountPayload,
  SubaccountData,
  SwapLog,
  SwapPayload,
  UsedLimitData
} from "./types";
import { Event } from "./webhooks";

export enum Endpoint {
  GetSubaccount = "/v2/account/sub-accounts",
  Subaccounts = "/subaccounts",
  PayOut = "/pay-out",
  BrCode = "/pay-in/br-code",
  AccountLimits = "/v2/account/limits",
  UsedLimit = "/used-limit",
  WebhookEvents = "/webhooks/events",
  PixInfo = "/pay-out/pix-info",
  PixHistory = "/pay-in/pix/history",
  SwapHistory = "/swap/history",
  FastQuote = "/fast-quote",
  Swap = "/swap",
  OnChainHistoryOut = "/on-chain/history/out",
  KycLevel2 = "/kyc/level2",
  KycRetry = "/kyc/retry",
  OnChainOut = "/on-chain/transfer",
  FixedRateQuote = "/v2/account/quote/fixed-rate",
  Tickets = "/v2/account/tickets"
}

export interface EndpointMapping {
  [Endpoint.GetSubaccount]: {
    POST: {
      body: undefined;
      response: undefined;
    };
    GET: {
      body: undefined;
      response: AveniaSubaccount;
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
  [Endpoint.Subaccounts]: {
    POST: {
      body: RegisterSubaccountPayload;
      response: { id: string };
    };
    GET: {
      body: undefined;
      response: { subaccounts: SubaccountData[] };
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
  [Endpoint.PayOut]: {
    POST: {
      body: OfframpPayload;
      response: { id: string };
    };
    GET: {
      body: undefined;
      response: undefined;
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
  [Endpoint.AccountLimits]: {
    POST: {
      body: undefined;
      response: undefined;
    };
    GET: {
      body: undefined;
      response: AccountLimitsResponse;
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
  [Endpoint.BrCode]: {
    POST: {
      body: undefined;
      response: undefined;
    };
    GET: {
      body: undefined;
      response: { brCode: string };
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
  [Endpoint.WebhookEvents]: {
    POST: {
      body: undefined;
      response: undefined;
    };
    GET: {
      body: undefined;
      response: { events: Event[] };
    };
    PATCH: {
      body: { ids: string[] };
      response: undefined;
    };
  };
  [Endpoint.PixInfo]: {
    POST: {
      body: undefined;
      response: undefined;
    };
    GET: {
      body: undefined;
      response: PixKeyData;
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
  [Endpoint.PixHistory]: {
    POST: {
      body: undefined;
      response: undefined;
    };
    GET: {
      body: undefined;
      response: { depositsLogs: DepositLog[] };
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
  [Endpoint.SwapHistory]: {
    POST: {
      body: undefined;
      response: undefined;
    };
    GET: {
      body: undefined;
      response: { swapLogs: SwapLog[] };
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
  [Endpoint.FastQuote]: {
    POST: {
      body: undefined;
      response: undefined;
    };
    GET: {
      body: undefined;
      response: FastQuoteResponse;
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
  [Endpoint.Swap]: {
    POST: {
      body: SwapPayload;
      response: { id: string };
    };
    GET: {
      body: undefined;
      response: undefined;
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
  [Endpoint.OnChainHistoryOut]: {
    POST: {
      body: undefined;
      response: undefined;
    };
    GET: {
      body: undefined;
      response: { onchainLogs: OnchainLog[] };
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
  [Endpoint.KycLevel2]: {
    POST: {
      body: KycLevel2Payload;
      response: KycLevel2Response;
    };
    GET: {
      body: undefined;
      response: undefined;
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
  [Endpoint.KycRetry]: {
    POST: {
      body: KycRetryPayload;
      response: unknown; // Doesn't return anything. 201.
    };
    GET: {
      body: undefined;
      response: undefined;
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
  [Endpoint.OnChainOut]: {
    POST: {
      body: OnChainOutPayload;
      response: { id: string };
    };
    GET: {
      body: undefined;
      response: undefined;
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
  [Endpoint.FixedRateQuote]: {
    POST: {
      body: undefined;
      response: undefined;
    };
    GET: {
      body: undefined;
      response: QuoteResponse;
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
  [Endpoint.Tickets]: {
    POST: {
      body: PixInputTicketPayload | PixOutputTicketPayload;
      response: PixInputTicketOutput;
    };
    GET: {
      body: undefined;
      response: undefined;
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
}

export type Endpoints = keyof EndpointMapping;
export type Methods = keyof EndpointMapping[Endpoints];
