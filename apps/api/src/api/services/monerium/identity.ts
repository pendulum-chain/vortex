import { MoneriumApiError, MoneriumApiService, type MoneriumProfile } from "@vortexfi/shared";
import httpStatus from "http-status";
import type { Transaction } from "sequelize";
import ProviderCustomer, { type ProviderCustomerType } from "../../../models/providerCustomer.model";
import { APIError } from "../../errors/api-error";
import { findCustomerEntityIdsForProfile, getOrCreateCustomerEntityForProfile } from "../customer-entity.service";
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
  loadBinding: (
    userId: string,
    transaction?: Transaction,
    customerType?: ProviderCustomerType
  ) => Promise<MoneriumBinding | null>;
}

/**
 * Without a customer type, a single bound legal profile is unambiguous. With two bound profiles,
 * callers must name the intended legal type rather than silently operating on the active entity.
 */
export async function loadMoneriumBinding(
  userId: string,
  transaction?: Transaction,
  customerType?: ProviderCustomerType
): Promise<MoneriumBinding> {
  const entity = await getOrCreateCustomerEntityForProfile(userId, customerType, transaction);
  const bindings = await ProviderCustomer.findAll({
    ...(transaction ? { transaction } : {}),
    where: {
      customerEntityId: await findCustomerEntityIdsForProfile(userId, transaction),
      ...(customerType ? { customerType } : {}),
      provider: "monerium",
      rail: "eur"
    }
  });
  const bound = bindings.filter(candidate => candidate.providerCustomerId);
  if (bound.length > 1) {
    throw new APIError({
      isPublic: true,
      message: customerType
        ? "Multiple Monerium profiles are bound for this customer type"
        : "Specify customerType to select the Monerium legal profile",
      status: httpStatus.CONFLICT,
      type: customerType ? "MONERIUM_BINDING_AMBIGUOUS" : "MONERIUM_CUSTOMER_TYPE_REQUIRED"
    });
  }
  const binding = bound[0] ?? bindings.find(candidate => candidate.customerEntityId === entity.id) ?? bindings[0];
  if (!binding) return { customerEntityId: entity.id, customerType: entity.type, profileId: null };
  return {
    customerEntityId: binding.customerEntityId,
    customerType: binding.customerType,
    profileId: binding.providerCustomerId
  };
}

async function getUserClient(customerEntityId: string, customerType: ProviderCustomerType): Promise<MoneriumIdentityClient> {
  return MoneriumApiService.forUserAccessToken(await getMoneriumUserAccessToken(customerEntityId, customerType));
}

function isInvisibleToApp(error: unknown): boolean {
  return error instanceof MoneriumApiError && (error.status === 403 || error.status === 404);
}

function reauthenticationRequired(): APIError {
  return new APIError({
    isPublic: true,
    message: "Monerium reauthentication is required",
    status: httpStatus.NOT_FOUND,
    type: MONERIUM_REAUTHENTICATION_REQUIRED
  });
}

/** The access token can be revoked between the profile read and any later Monerium call. */
function withReauthenticationErrors(user: MoneriumIdentityClient): MoneriumIdentityClient {
  async function call<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      if (error instanceof MoneriumApiError && error.status === 401) throw reauthenticationRequired();
      throw error;
    }
  }
  return {
    getProfile: (...args) => call(() => user.getProfile(...args)),
    linkAddress: (...args) => call(() => user.linkAddress(...args)),
    listAddresses: (...args) => call(() => user.listAddresses(...args)),
    listIbans: (...args) => call(() => user.listIbans(...args)),
    requestIban: (...args) => call(() => user.requestIban(...args)),
    updateIbanDestination: (...args) => call(() => user.updateIbanDestination(...args))
  };
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
  return async function resolveMoneriumIdentity(
    userId: string,
    transaction?: Transaction,
    customerType?: ProviderCustomerType
  ): Promise<MoneriumIdentity> {
    const binding = await dependencies.loadBinding(userId, transaction, customerType);
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

    const user = withReauthenticationErrors(await dependencies.getUserClient(binding.customerEntityId, binding.customerType));
    const profile = await user.getProfile(profileId);
    return { client: user, profile, profileId, source: "oauth" };
  };
}

export const resolveMoneriumIdentity = createResolveMoneriumIdentity();
