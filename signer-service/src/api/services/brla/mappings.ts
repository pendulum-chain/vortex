import {
  RegisterSubaccountPayload,
  SubaccountData,
  OfframpPayload,
  PixKeyData,
  DepositLog,
  FastQuoteResponse,
  OnchainLogs,
} from './types';
import { Event } from './webhooks';

export enum Endpoint {
  Subaccounts = '/subaccounts',
  PayOut = '/pay-out',
  BrCode = '/pay-in/br-code',
  WebhookEvents = '/webhooks/events',
  PixInfo = '/pay-out/pix-info',
  PixHistory = '/pay-in/pix/history',
  FastQuote = '/fast-quote',
  Swap = '/swap',
}

export interface EndpointMapping {
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
      body: undefined;
      response: { onChainLogs: OnchainLogs[] };
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
