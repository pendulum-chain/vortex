import { MoneriumApiError, MoneriumApiService, type MoneriumProfile } from "@vortexfi/shared";
import httpStatus from "http-status";
import type { Transaction } from "sequelize";
import ProviderCustomer, { type ProviderCustomerType } from "../../../models/providerCustomer.model";
import { APIError } from "../../errors/api-error";
import { getOrCreateCustomerEntityForProfile } from "../customer-entity.service";
import { getMoneriumUserAccessToken, MONERIUM_REAUTHENTICATION_REQUIRED } from "./monerium.service";

export const MONERIUM_ONBOARDING_REQUIRED = "MONERIUM_ONBOARDING_REQUIRED";

export type MoneriumIdentitySource = "whitelabel" | "oauth";

export type MoneriumIdentityClient = Pick<
  MoneriumApiService,
  "getProfile" | "linkAddress" | "listAddresses" | "listIbans" | "requestIban" | "updateIbanDestination"
>;

export interface MoneriumBinding {
  customerEntityId: string;
  customerType: ProviderCustomerType;
  profileId: string | null;
}

export interface MoneriumIdentity {
  client: MoneriumIdentityClient;
  profile: MoneriumProfile;
  profileId: string;
  source: MoneriumIdentitySource;
}

export interface MoneriumIdentityDependencies {
  getUserClient: (customerEntityId: string, customerType: ProviderCustomerType) => Promise<MoneriumIdentityClient>;
  getWhiteLabelClient: () => MoneriumIdentityClient;
  loadBinding: (userId: string, transaction?: Transaction) => Promise<MoneriumBinding | null>;
}

async function loadMoneriumBinding(userId: string, transaction?: Transaction): Promise<MoneriumBinding> {
  const entity = await getOrCreateCustomerEntityForProfile(userId, undefined, transaction);
  const binding = await ProviderCustomer.findOne({
    ...(transaction ? { transaction } : {}),
    where: { customerEntityId: entity.id, customerType: entity.type, provider: "monerium", rail: "eur" }
  });
  return { customerEntityId: entity.id, customerType: entity.type, profileId: binding?.providerCustomerId ?? null };
}

async function getUserClient(customerEntityId: string, customerType: ProviderCustomerType): Promise<MoneriumIdentityClient> {
  return MoneriumApiService.forUserAccessToken(await getMoneriumUserAccessToken(customerEntityId, customerType));
}

function isInvisibleToApp(error: unknown): boolean {
  return error instanceof MoneriumApiError && (error.status === 403 || error.status === 404);
}

/**
 * Resolves which Monerium application can read the authenticated user's profile: the white-label
 * app first (client credentials), then the OAuth app through the user's backend-held token. Both
 * apps share one `provider_customers` binding; the white-label API answers 403/404 for profiles
 * that only authorized the OAuth app. The source is decided per call and never persisted.
 */
export function createResolveMoneriumIdentity(
  dependencies: MoneriumIdentityDependencies = {
    getUserClient,
    getWhiteLabelClient: () => MoneriumApiService.getInstance(),
    loadBinding: loadMoneriumBinding
  }
) {
  return async function resolveMoneriumIdentity(userId: string, transaction?: Transaction): Promise<MoneriumIdentity> {
    const binding = await dependencies.loadBinding(userId, transaction);
    if (!binding?.profileId) {
      throw new APIError({
        isPublic: true,
        message: "Monerium onboarding is required before an EUR ramp can be registered",
        status: httpStatus.FORBIDDEN,
        type: MONERIUM_ONBOARDING_REQUIRED
      });
    }
    const profileId = binding.profileId;

    const whiteLabel = dependencies.getWhiteLabelClient();
    try {
      const profile = await whiteLabel.getProfile(profileId);
      return { client: whiteLabel, profile, profileId, source: "whitelabel" };
    } catch (error) {
      if (!isInvisibleToApp(error)) throw error;
    }

    const user = await dependencies.getUserClient(binding.customerEntityId, binding.customerType);
    try {
      const profile = await user.getProfile(profileId);
      return { client: user, profile, profileId, source: "oauth" };
    } catch (error) {
      if (error instanceof MoneriumApiError && error.status === 401) {
        throw new APIError({
          isPublic: true,
          message: "Monerium reauthentication is required",
          status: httpStatus.NOT_FOUND,
          type: MONERIUM_REAUTHENTICATION_REQUIRED
        });
      }
      throw error;
    }
  };
}

export const resolveMoneriumIdentity = createResolveMoneriumIdentity();
