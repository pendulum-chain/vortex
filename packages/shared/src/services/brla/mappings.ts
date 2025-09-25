import { AveniaAccountType } from "../../../src/services/brla";
import {
  AccountLimitsResponse,
  AveniaAccountBalanceResponse,
  AveniaAccountInfoResponse,
  AveniaDocumentGetResponse,
  AveniaPayoutTicket,
  AveniaQuoteResponse,
  AveniaSubaccount,
  DepositLog,
  DocumentUploadRequest,
  DocumentUploadResponse,
  FastQuoteResponse,
  GetKycAttemptResponse,
  KycLevel1Payload,
  KycLevel1Response,
  KycRetryPayload,
  OfframpPayload,
  OnChainOutPayload,
  OnchainLog,
  PixInputTicketOutput,
  PixInputTicketPayload,
  PixKeyData,
  PixOutputTicketOutput,
  PixOutputTicketPayload,
  RegisterSubaccountPayload,
  SubaccountData,
  SwapLog,
  SwapPayload
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
  KycLevel1 = "/v2/kyc/new-level-1/api",
  FixedRateQuote = "/v2/account/quote/fixed-rate",
  Tickets = "/v2/account/tickets",
  AccountInfo = "/v2/account/account-info",
  Documents = "/v2/documents",
  GetKycAttempt = "/v2/kyc/attempts",
  Balances = "/v2/account/balances"
}

export interface EndpointMapping {
  [Endpoint.GetSubaccount]: {
    POST: {
      body: { name: string; accountType: AveniaAccountType };
      response: { id: string };
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
  [Endpoint.KycLevel1]: {
    POST: {
      body: any;
      response: KycLevel1Response;
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
      response: AveniaQuoteResponse;
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
  [Endpoint.Tickets]: {
    POST: {
      body: PixInputTicketPayload | PixOutputTicketPayload;
      response: PixInputTicketOutput | PixOutputTicketOutput;
    };
    GET: {
      body: undefined;
      response: { ticket: AveniaPayoutTicket };
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
  [Endpoint.AccountInfo]: {
    POST: {
      body: undefined;
      response: undefined;
    };
    GET: {
      body: undefined;
      response: AveniaAccountInfoResponse;
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
  [Endpoint.Documents]: {
    POST: {
      body: DocumentUploadRequest;
      response: DocumentUploadResponse;
    };
    GET: {
      body: undefined;
      response: AveniaDocumentGetResponse;
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
  [Endpoint.GetKycAttempt]: {
    POST: {
      body: undefined;
      response: undefined;
    };
    GET: {
      body: undefined;
      response: GetKycAttemptResponse;
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
  [Endpoint.Balances]: {
    POST: {
      body: undefined;
      response: undefined;
    };
    GET: {
      body: undefined;
      response: AveniaAccountBalanceResponse;
    };
    PATCH: {
      body: undefined;
      response: undefined;
    };
  };
}

export type Endpoints = keyof EndpointMapping;
export type Methods = keyof EndpointMapping[Endpoints];
