interface SignInMessageFields {
  scheme: string;
  domain: string;
  address: string;
  nonce: string;
  expirationTime: number | string;
  issuedAt?: number | string;
}

class SignInMessage {
  readonly scheme: string;
  readonly domain: string;
  readonly address: string;
  readonly nonce: string;
  readonly expirationTime: string;
  readonly issuedAt: string;

  // fixed statement string
  static readonly LOGIN_MESSAGE = ' wants you to sign in with your account: ';

  constructor(fields: SignInMessageFields) {
    this.scheme = fields.scheme;
    this.domain = fields.domain;
    this.address = fields.address;
    this.nonce = fields.nonce;
    this.expirationTime = new Date(fields.expirationTime).toISOString();
    this.issuedAt = fields.issuedAt ? new Date(fields.issuedAt).toISOString() : new Date().toISOString();
  }

  toMessage(): string {
    const header = `${this.domain}${SignInMessage.LOGIN_MESSAGE}${this.address}`;
    const body = `\nNonce: ${this.nonce}\nIssued At: ${this.issuedAt}\nExpiration Time: ${this.expirationTime}`;
    return `${header}\n\n${body}`;
  }

  static fromMessage(message: string): SignInMessage {
    const lines = message
      .split('\n')
      .map((line: string) => line.trim())
      .filter(Boolean);

    const headerLine = lines.find((line) => line.includes(SignInMessage.LOGIN_MESSAGE)) ?? '';
    const [domain, address] = headerLine.split(SignInMessage.LOGIN_MESSAGE).map((part) => part.trim());

    const getValue = (prefix: string): string => {
      const line = lines.find((l) => l.startsWith(prefix)) ?? '';
      return line.split(`${prefix}:`)[1]?.trim() ?? '';
    };

    const nonce = getValue('Nonce');
    const issuedAt = getValue('Issued At');
    const expirationTime = getValue('Expiration Time');

    return new SignInMessage({
      scheme: 'https',
      domain,
      address,
      nonce,
      expirationTime: new Date(expirationTime).getTime(),
      issuedAt: new Date(issuedAt).getTime(),
    });
  }
}

export { SignInMessage, type SignInMessageFields };
