import {
  type EvmAddress,
  EvmClientManager,
  getEvmTokenBalance,
  type IbanPaymentData,
  type MoneriumAddress,
  MoneriumApiService,
  type MoneriumIban
} from "@vortexfi/shared";
import crypto from "crypto";
import httpStatus from "http-status";
import { isAddress } from "viem";
import ProviderCustomer, { VerificationStatus } from "../../../../../../models/providerCustomer.model";
import { APIError } from "../../../../../errors/api-error";
import { getOrCreateCustomerEntityForProfile } from "../../../../customer-entity.service";
import type { RegisterCtx, RegistrationResult } from "../../core/types";
import { MONERIUM_EURE, MONERIUM_ISSUE_NETWORKS, type MoneriumIssueMetadata, type MoneriumIssueNetwork } from "./simulation";

const CALLER_IDENTITY_FIELDS = [
  "address",
  "iban",
  "moneriumAddress",
  "moneriumIban",
  "moneriumProfileId",
  "profileId"
] as const;

export interface MoneriumIssueRegistrationInput extends Record<string, unknown> {
  address?: string;
  iban?: string;
  moneriumAddress?: string;
  moneriumIban?: string;
  moneriumProfileId?: string;
  profileId?: string;
}

export interface MoneriumIssueRegistrationFacts {
  amountRaw: string;
  chain: MoneriumIssueNetwork;
  moneriumAddress: string;
  moneriumIban: string;
  moneriumPaymentReference: string;
  moneriumProfileId: string;
  owner: string;
  ownerEureBalanceBaselineRaw: string;
  token: typeof MONERIUM_EURE;
}

export interface MoneriumIssueResponseArtifacts extends Record<string, unknown> {
  ibanPaymentData: IbanPaymentData;
}

interface MoneriumIssueRegistrationDependencies {
  createReference: () => string;
  getClient: () => Pick<MoneriumApiService, "getProfile" | "listAddresses" | "listIbans">;
  isContractAddress?: (network: MoneriumIssueNetwork, address: `0x${string}`) => Promise<boolean>;
  readOwnerEureBalance: typeof getEvmTokenBalance;
  resolveProfileId: (userId: string, transaction?: RegisterCtx<never>["transaction"]) => Promise<string>;
}

async function resolveMoneriumProfileIdForUser(
  userId: string,
  transaction?: RegisterCtx<never>["transaction"]
): Promise<string> {
  const entity = await getOrCreateCustomerEntityForProfile(userId, undefined, transaction);
  const providerCustomer = await ProviderCustomer.findOne({
    ...(transaction ? { transaction } : {}),
    where: {
      customerEntityId: entity.id,
      customerType: entity.type,
      provider: "monerium",
      rail: "eur"
    }
  });
  if (
    !providerCustomer?.providerCustomerId ||
    providerCustomer.status !== VerificationStatus.Approved ||
    providerCustomer.statusExternal?.toLowerCase() !== "approved"
  ) {
    throw new APIError({
      message: "The authenticated legal entity does not have an approved Monerium profile",
      status: httpStatus.BAD_REQUEST
    });
  }
  return providerCustomer.providerCustomerId;
}

function createPaymentReference(): string {
  return `VTX${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`;
}

function matchingDestinations(
  profileId: string,
  chain: (typeof MONERIUM_ISSUE_NETWORKS)[MoneriumIssueNetwork]["chain"],
  addresses: readonly MoneriumAddress[],
  ibans: readonly MoneriumIban[]
): Array<{ address: MoneriumAddress; iban: MoneriumIban }> {
  return ibans.flatMap(iban => {
    if (iban.chain !== chain || iban.profile !== profileId) return [];
    return addresses
      .filter(
        address =>
          address.profile === profileId &&
          address.chains.includes(chain) &&
          isAddress(address.address) &&
          address.address.toLowerCase() === iban.address.toLowerCase()
      )
      .map(address => ({ address, iban }));
  });
}

export function createRegisterMoneriumIssue(
  dependencies: MoneriumIssueRegistrationDependencies = {
    createReference: createPaymentReference,
    getClient: () => MoneriumApiService.getInstance(),
    readOwnerEureBalance: getEvmTokenBalance,
    resolveProfileId: resolveMoneriumProfileIdForUser
  }
) {
  return async function registerMoneriumIssue(
    ctx: RegisterCtx<MoneriumIssueMetadata, MoneriumIssueRegistrationInput>
  ): Promise<RegistrationResult<MoneriumIssueRegistrationFacts, MoneriumIssueMetadata>> {
    const callerIdentityField = CALLER_IDENTITY_FIELDS.find(field => ctx.input[field] !== undefined);
    if (callerIdentityField) {
      throw new APIError({
        message: `Monerium identity is server-derived; ${callerIdentityField} must not be supplied`,
        status: httpStatus.BAD_REQUEST
      });
    }

    const profileId = await dependencies.resolveProfileId(ctx.authenticatedUser.id, ctx.transaction);
    const client = dependencies.getClient();
    const profile = await client.getProfile(profileId);
    if (profile.id !== profileId || profile.state !== "approved") {
      throw new APIError({ message: "The Monerium profile is not approved", status: httpStatus.BAD_REQUEST });
    }

    const moneriumChain = MONERIUM_ISSUE_NETWORKS[ctx.metadata.network].chain;
    const [addressResponse, ibanResponse] = await Promise.all([
      client.listAddresses({ chain: moneriumChain, profile: profileId }),
      client.listIbans({ chain: moneriumChain, profile: profileId })
    ]);
    const destinations = matchingDestinations(profileId, moneriumChain, addressResponse.addresses, ibanResponse.ibans);
    if (destinations.length !== 1) {
      throw new APIError({
        message: `Expected exactly one Monerium ${moneriumChain} IBAN/address match, found ${destinations.length}`,
        status: httpStatus.CONFLICT
      });
    }

    const destination = destinations[0];
    const address = destination.address.address;
    const iban = destination.iban;
    const isContractAddress =
      dependencies.isContractAddress ??
      (async (network: MoneriumIssueNetwork, owner: `0x${string}`) =>
        Boolean(await EvmClientManager.getInstance().getClient(network).getBytecode({ address: owner })));
    if (await isContractAddress(ctx.metadata.network, address as `0x${string}`)) {
      throw new APIError({
        message: "Monerium self-transfer requires a profile-linked EOA; contract wallet destinations are not supported",
        status: httpStatus.BAD_REQUEST
      });
    }
    const ownerEureBalanceBaseline = await dependencies.readOwnerEureBalance({
      chain: ctx.metadata.network,
      ownerAddress: address as EvmAddress,
      tokenAddress: MONERIUM_ISSUE_NETWORKS[ctx.metadata.network].eureAddress as EvmAddress
    });
    const reference = dependencies.createReference();
    return {
      facts: {
        amountRaw: ctx.metadata.issue.outputAmountRaw,
        chain: ctx.metadata.network,
        moneriumAddress: address,
        moneriumIban: iban.iban,
        moneriumPaymentReference: reference,
        moneriumProfileId: profileId,
        owner: address,
        ownerEureBalanceBaselineRaw: ownerEureBalanceBaseline.toFixed(0),
        token: MONERIUM_EURE
      },
      responseArtifacts: {
        ibanPaymentData: {
          bic: iban.bic,
          iban: iban.iban,
          receiverName: iban.name,
          reference
        }
      } satisfies MoneriumIssueResponseArtifacts
    };
  };
}

export const registerMoneriumIssue = createRegisterMoneriumIssue();
