import { AveniaAccountType } from "../../../src/services/brla";
import {
  AccountLimitsResponse,
  AveniaAccountBalanceResponse,
  AveniaAccountInfoResponse,
  AveniaDocumentGetResponse,
  AveniaPayinTicket,
  AveniaPayoutTicket,
  AveniaQuoteResponse,
  AveniaSubaccount,
  AveniaSwapTicket,
  DocumentUploadRequest,
  DocumentUploadResponse,
  GetKycAttemptResponse,
  KybAttemptStatusResponse,
  KybLevel1Response,
  KycLevel1Payload,
  KycLevel1Response,
  OnchainSwapTicketPayload,
  PixInputTicketOutput,
  PixInputTicketPayload,
  PixKeyData,
  PixOutputTicketOutput,
  PixOutputTicketPayload
} from "./types";

export enum Endpoint {
  GetSubaccount = "/v2/account/sub-accounts",
  AccountLimits = "/v2/account/limits",
  PixInfo = "/v2/account/bank-accounts/brl/pix-info",
  KycLevel1 = "/v2/kyc/new-level-1/api",
  KybLevel1WebSdk = "/v2/kyc/new-level-1/web-sdk",
  FixedRateQuote = "/v2/account/quote/fixed-rate",
  Tickets = "/v2/account/tickets",
  AccountInfo = "/v2/account/account-info",
  Documents = "/v2/documents",
  GetKycAttempt = "/v2/kyc/attempts",
  GetKybAttempt = "/v2/kyc/attempts/{attemptId}",
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
  [Endpoint.KycLevel1]: {
    POST: {
      body: KycLevel1Payload;
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
      body: PixInputTicketPayload | PixOutputTicketPayload | OnchainSwapTicketPayload;
      response: PixInputTicketOutput | PixOutputTicketOutput;
    };
    GET: {
      body: undefined;
      response:
        | { ticket: AveniaPayoutTicket | AveniaPayinTicket | AveniaSwapTicket }
        | { tickets: AveniaPayoutTicket[] | AveniaPayinTicket[] | AveniaSwapTicket[] };
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
  [Endpoint.KybLevel1WebSdk]: {
    POST: {
      body: undefined;
      response: KybLevel1Response;
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
  [Endpoint.GetKybAttempt]: {
    POST: {
      body: undefined;
      response: undefined;
    };
    GET: {
      body: undefined;
      response: KybAttemptStatusResponse;
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
