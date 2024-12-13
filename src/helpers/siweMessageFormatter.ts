interface SignInMessageFields {
  scheme: string;
  domain: string;
  address: string;
  statement?: string;
  uri: string;
  version: string;
  chainId?: number | string;
  nonce: string;
  expirationTime?: string;
  issuedAt?: string;
  notBefore?: string;
  resources?: string[];
}

export class SignInMessage {
  public scheme: string;
  public domain: string;
  public address: string;
  public statement?: string;
  public uri: string;
  public version: string;
  public chainId?: number | string;
  public nonce: string;
  public expirationTime?: string;
  public issuedAt?: string;
  public notBefore?: string;
  public resources?: string[];

  constructor(fields: SignInMessageFields) {
    this.scheme = fields.scheme;
    this.domain = fields.domain;
    this.address = fields.address;
    this.statement = fields.statement;
    this.uri = fields.uri;
    this.version = fields.version;
    this.chainId = fields.chainId;
    this.nonce = fields.nonce;
    this.expirationTime = fields.expirationTime;
    this.issuedAt = fields.issuedAt ?? new Date().toISOString();
    this.notBefore = fields.notBefore;
    this.resources = fields.resources;
  }

  public toMessage(): string {
    let header = `${this.domain} wants you to sign in with your Substrate account:`;
    let body = `${this.address}\n\n${this.statement || ''}\n\nURI: ${this.uri}\nVersion: ${this.version}\nChain ID: ${
      this.chainId ?? 'N/A'
    }\nNonce: ${this.nonce}\nIssued At: ${this.issuedAt}`;

    if (this.expirationTime) {
      body += `\nExpiration Time: ${this.expirationTime}`;
    }
    if (this.notBefore) {
      body += `\nNot Before: ${this.notBefore}`;
    }

    return `${header}\n${body}`;
  }

  public static fromMessage(message: string): SignInMessage {
    const lines = message.split('\n').map((l) => l.trim());
    const domain = lines[0].split(' wants ')[0];
    const address = lines[1];

    const statementIndex = 3;
    const statement = lines[statementIndex] || '';

    let uri = '';
    let version = '';
    let chainId: string | number | undefined = undefined;
    let nonce = '';
    let issuedAt = '';
    let expirationTime: string | undefined;
    let notBefore: string | undefined;
    let resources: string[] = [];

    for (let i = statementIndex + 2; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('URI:')) {
        uri = line.split('URI: ')[1];
      } else if (line.startsWith('Version:')) {
        version = line.split('Version: ')[1];
      } else if (line.startsWith('Chain ID:')) {
        const cid = line.split('Chain ID: ')[1];
        chainId = cid !== 'N/A' ? cid : undefined;
      } else if (line.startsWith('Nonce:')) {
        nonce = line.split('Nonce: ')[1];
      } else if (line.startsWith('Issued At:')) {
        issuedAt = line.split('Issued At: ')[1];
      } else if (line.startsWith('Expiration Time:')) {
        expirationTime = line.split('Expiration Time: ')[1];
      } else if (line.startsWith('Not Before:')) {
        notBefore = line.split('Not Before: ')[1];
      } else if (line.startsWith('Resources:')) {
        for (let j = i + 1; j < lines.length; j++) {
          if (!lines[j].startsWith('- ')) break;
          resources.push(lines[j].slice(2));
        }
      }
    }

    return new SignInMessage({
      scheme: 'https',
      domain,
      address,
      statement: statement || undefined,
      uri,
      version,
      chainId,
      nonce,
      issuedAt,
      expirationTime,
      notBefore,
      resources: resources.length > 0 ? resources : undefined,
    });
  }
}
