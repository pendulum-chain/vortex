class SignInMessage {
  // fixed statement string
  static LOGIN_MESSAGE = ' wants you to sign in with your account: ';

  constructor(fields) {
    this.scheme = fields.scheme;
    this.domain = fields.domain;
    this.address = fields.address;
    this.nonce = fields.nonce;
    this.expirationTime = new Date(fields.expirationTime).toISOString();
    this.issuedAt = fields.issuedAt ? new Date(fields.issuedAt).toISOString() : new Date().toISOString();
  }

  toMessage() {
    const header = `${this.domain}${SignInMessage.LOGIN_MESSAGE}${this.address}`;

    const body = `\nNonce: ${this.nonce}\nIssued At: ${this.issuedAt}\nExpiration Time: ${this.expirationTime}`;

    return `${header}\n\n${body}`;
  }

  static fromMessage(message) {
    const lines = message
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const headerLine = lines.find((line) => line.includes(SignInMessage.LOGIN_MESSAGE)) || '';
    const [domain, address] = headerLine.split(SignInMessage.LOGIN_MESSAGE).map((part) => part.trim());

    const nonceLine = lines.find((line) => line.startsWith('Nonce:')) || '';
    const nonce = nonceLine.split('Nonce:')[1]?.trim() || '';

    const issuedAtLine = lines.find((line) => line.startsWith('Issued At:')) || '';
    const issuedAt = issuedAtLine.split('Issued At:')[1]?.trim(); // Can't really be empty. Constructor will default to current date if not defined.
    const issuedAtMilis = new Date(issuedAt).getTime();

    const expirationTimeLine = lines.find((line) => line.startsWith('Expiration Time:')) || '';
    const expirationTime = expirationTimeLine.split('Expiration Time:')[1]?.trim();
    const expirationTimeMilis = new Date(expirationTime).getTime();

    return new SignInMessage({
      scheme: 'https',
      domain,
      address,
      nonce,
      expirationTime: expirationTimeMilis,
      issuedAt: issuedAtMilis,
    });
  }
}

module.exports = { SignInMessage };
