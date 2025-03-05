import { BRLA_LOGIN_PASSWORD, BRLA_LOGIN_USERNAME, BRLA_BASE_URL } from '../../../constants/constants';
import { SubaccountData, RegisterSubaccountPayload, OfframpPayload } from './types';
import { Event } from './webhooks';

interface EndpointMapping {
  '/subaccounts': {
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
  '/pay-out': {
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
  '/webhooks/events': {
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
}

type Endpoints = keyof EndpointMapping;
type Methods = keyof EndpointMapping[keyof EndpointMapping];

export class BrlaApiService {
  private static instance: BrlaApiService;
  private token: string | null = null;

  private readonly loginUrl: string = `${BRLA_BASE_URL}/login`;

  private constructor() {}

  public static getInstance(): BrlaApiService {
    if (!BrlaApiService.instance) {
      BrlaApiService.instance = new BrlaApiService();
    }
    return BrlaApiService.instance;
  }

  private async login(): Promise<void> {
    const response = await fetch(this.loginUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: BRLA_LOGIN_USERNAME, password: BRLA_LOGIN_PASSWORD }),
    });

    if (!response.ok) {
      throw new Error(`Login failed with status ${response.status}`);
    }

    const token = (await response.json()).accessToken;

    if (!token) {
      throw new Error('No token returned from login.');
    }

    this.token = token;
  }

  public async sendRequest<M extends Methods, E extends Endpoints>(
    endpoint: E,
    method: M,
    queryParams?: string,
    payload?: EndpointMapping[E][M]['body'],
  ): Promise<EndpointMapping[E][M]['response']> {
    if (!this.token) {
      await this.login();
    }
    let fullUrl = `${BRLA_BASE_URL}${endpoint}`;

    if (queryParams) {
      fullUrl += `?${queryParams}`;
    }
    const buildOptions = () => {
      const options: RequestInit = {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
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
        throw new Error('Authorization error after re-login.');
      }
    }

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}, ${await response.text()}`);
    }
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  public async getSubaccount(taxId: string): Promise<SubaccountData | undefined> {
    const endpoint = `/subaccounts`;
    const query = `taxId=${encodeURIComponent(taxId)}`;
    const response = await this.sendRequest(endpoint, 'GET', query);
    return response.subaccounts[0];
  }

  public async triggerOfframp(offrampParams: OfframpPayload): Promise<{ id: string }> {
    const endpoint = `/pay-out`;
    return await this.sendRequest(endpoint, 'POST', undefined, offrampParams);
  }

  public async createSubaccount(registerSubaccountPayload: RegisterSubaccountPayload): Promise<{ id: string }> {
    const endpoint = `/subaccounts`;
    return await this.sendRequest(endpoint, 'POST', undefined, registerSubaccountPayload);
  }

  public async getAllEventsByUser(userId: string): Promise<Event[] | undefined> {
    const endpoint = `/webhooks/events`;
    const query = `subaccountId=${encodeURIComponent(userId)}`;
    const response = await this.sendRequest(endpoint, 'GET', query);
    return response.events;
  }

  public async acknowledgeEvents(ids: string[]): Promise<void> {
    const endpoint = `/webhooks/events`;
    return await this.sendRequest(endpoint, 'PATCH', undefined, { ids });
  }
}
