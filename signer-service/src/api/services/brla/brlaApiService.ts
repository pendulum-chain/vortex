import { BRLA_LOGIN_PASSWORD, BRLA_LOGIN_USERNAME, BRLA_BASE_URL } from '../../../constants/constants';

interface SubaccountData {
  id: string;
  fullName: string;
  phone: string;
  kyc: any;
  address: any;
  createdAt: string;
  wallets: { evm: string; tron: string };
  brCode: string;
}

interface RegisterSubaccount {
  stuff: string;
}

interface OfframpPayload {
  subaccountId: string;
  pixKey: string;
  amount: string;
}

interface EndpointMapping {
  '/subaccounts': {
    POST: {
      body: RegisterSubaccount;
      response: { id: string };
    };
    GET: {
      body: undefined;
      response: { subaccounts: SubaccountData[] };
    };
  };
  '/pay-out': {
    POST: {
      body: OfframpPayload; //TODO test if the taxId of the RECEIVER is actaully needed
      response: { id: string };
    };
    GET: {
      body: undefined;
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
  private readonly credentials = { username: 'your_username', password: 'your_password' };

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
      throw new Error(`Request failed with status ${response.status}`);
    }

    return response.json();
  }

  public async getSubaccount(taxId: string): Promise<SubaccountData | undefined> {
    const endpoint = `/subaccounts`;
    const query = `taxId=${encodeURIComponent(taxId)}`; // could be also id=.....
    const repsonse = await this.sendRequest(endpoint, 'GET', query);
    return repsonse.subaccounts[0];
  }

  public async triggerOfframp(offrampParams: OfframpPayload): Promise<{ id: string }> {
    const endpoint = `/pay-out`;
    const repsonse = await this.sendRequest(endpoint, 'POST', undefined, offrampParams);
    return repsonse;
  }
}
