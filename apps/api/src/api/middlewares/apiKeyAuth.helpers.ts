import Partner from "../../models/partner.model";
import { CredentialContext, validatePublicKey, validateSecretKey } from "../services/apiCredential.service";

export {
  digestApiKey,
  generateApiKey,
  getKeyPrefix,
  getKeyType,
  getSecretKeyLookupPrefix,
  isValidApiKeyFormat,
  isValidSecretKeyFormat,
  SECRET_KEY_LOOKUP_PREFIX_LENGTH
} from "./apiKeyFormat";

export interface AuthenticatedPartner {
  id: string;
  name: string;
}

export interface ValidatedSecretKey {
  apiKeyId: string;
  credential: CredentialContext;
  partner: AuthenticatedPartner | null;
}

export interface ValidatedPublicKey {
  credential: CredentialContext;
}

export async function validatePublicApiKey(apiKey: string): Promise<ValidatedPublicKey | null> {
  const credential = await validatePublicKey(apiKey);
  if (!credential) return null;
  const partner = credential.partnerId ? await Partner.findByPk(credential.partnerId) : null;
  if (credential.partnerId && !partner) return null;
  return { credential };
}

export async function validateSecretApiKey(apiKey: string): Promise<ValidatedSecretKey | null> {
  const credential = await validateSecretKey(apiKey);
  if (!credential) return null;
  const partner = credential.partnerId ? await Partner.findOne({ where: { id: credential.partnerId, isActive: true } }) : null;
  if (credential.partnerId && !partner) return null;
  return {
    apiKeyId: credential.credentialId,
    credential,
    partner: partner ? { id: partner.id, name: partner.name } : null
  };
}

export async function validateApiKey(apiKey: string): Promise<ValidatedSecretKey | null> {
  return validateSecretApiKey(apiKey);
}
