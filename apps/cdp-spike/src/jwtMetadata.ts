export interface JwtMetadata {
  algorithm?: string;
  issuer?: string;
  keyId?: string;
}

function decodePart(part: string): Record<string, unknown> {
  const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  return JSON.parse(atob(padded)) as Record<string, unknown>;
}

export function readJwtMetadata(token: string): JwtMetadata {
  const [headerPart, payloadPart] = token.split(".");
  if (!headerPart || !payloadPart) throw new Error("Vortex access token is not a JWT");

  const header = decodePart(headerPart);
  const payload = decodePart(payloadPart);
  return {
    algorithm: typeof header.alg === "string" ? header.alg : undefined,
    issuer: typeof payload.iss === "string" ? payload.iss : undefined,
    keyId: typeof header.kid === "string" ? header.kid : undefined
  };
}
