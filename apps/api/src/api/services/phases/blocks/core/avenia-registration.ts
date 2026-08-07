import {
  AveniaPaymentMethod,
  BrlaApiService,
  BrlaCurrency,
  FiatToken,
  generateReferenceLabel,
  type Limit,
  normalizeTaxId,
  RampDirection,
  validateMaskedNumber
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { Op } from "sequelize";
import logger from "../../../../../config/logger";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import RampState from "../../../../../models/rampState.model";
import { APIError } from "../../../../errors/api-error";
import { findAveniaCustomerByTaxId } from "../../../avenia/avenia-customer.service";
import { PriceFeedService } from "../../../priceFeed.service";

type AveniaApi = Pick<
  BrlaApiService,
  "createPayInQuote" | "createPixInputTicket" | "getSubaccountUsedLimit" | "subaccountInfo" | "validatePixKey"
>;

interface PendingRamp {
  quote?: { inputAmount: string; outputAmount: string };
}

export interface AveniaRegistrationDependencies {
  aveniaApi: AveniaApi;
  convertBrlToUsd: (amount: string) => Promise<string>;
  findAveniaCustomer: (taxId: string) => Promise<{ providerSubaccountId: string | null } | null>;
  findPendingRamps: (taxId: string, direction: RampDirection) => Promise<PendingRamp[]>;
}

function defaultDependencies(): AveniaRegistrationDependencies {
  return {
    aveniaApi: BrlaApiService.getInstance(),
    convertBrlToUsd: amount => PriceFeedService.getInstance().convertCurrency(amount, FiatToken.BRL, FiatToken.USD, 2),
    findAveniaCustomer: findAveniaCustomerByTaxId,
    findPendingRamps: async (taxId, direction) =>
      RampState.findAll({
        include: [{ as: "quote", model: QuoteTicket }],
        where: {
          currentPhase: { [Op.notIn]: ["complete", "failed", "timedOut", "initial"] },
          "state.taxId": normalizeTaxId(taxId),
          type: direction
        }
      }) as Promise<PendingRamp[]>
  };
}

export async function getPendingBrlVolume(
  taxId: string,
  direction: RampDirection,
  dependencies: AveniaRegistrationDependencies = defaultDependencies()
): Promise<Big> {
  const pendingRamps = await dependencies.findPendingRamps(normalizeTaxId(taxId), direction);
  let totalPendingBrl = new Big(0);

  for (const ramp of pendingRamps) {
    if (!ramp.quote) continue;
    totalPendingBrl = totalPendingBrl.plus(direction === RampDirection.BUY ? ramp.quote.inputAmount : ramp.quote.outputAmount);
  }

  return totalPendingBrl;
}

export async function validateAveniaLimits(
  amountBrl: string,
  limits: Limit[],
  direction: RampDirection,
  taxId: string,
  dependencies: AveniaRegistrationDependencies = defaultDependencies()
): Promise<void> {
  const pendingBrl = await getPendingBrlVolume(taxId, direction, dependencies);
  const effectiveAmountBrl = new Big(amountBrl).plus(pendingBrl);
  const brlLimits = limits.find(limit => limit.currency === BrlaCurrency.BRL);

  if (!brlLimits) {
    throw new APIError({ message: "BRL limits not found.", status: httpStatus.BAD_REQUEST });
  }

  const brlRemaining =
    direction === RampDirection.BUY
      ? Number(brlLimits.maxFiatIn) - Number(brlLimits.usedLimit.usedFiatIn)
      : Number(brlLimits.maxFiatOut) - Number(brlLimits.usedLimit.usedFiatOut);

  if (effectiveAmountBrl.gt(brlRemaining)) {
    throw new APIError({ message: "Amount exceeds BRL limit.", status: httpStatus.BAD_REQUEST });
  }

  const globalLimits = limits.find(limit => limit.currency === "*");
  if (!globalLimits) return;

  const effectiveAmountUsd = await dependencies.convertBrlToUsd(effectiveAmountBrl.toFixed(2));
  const globalRemaining =
    direction === RampDirection.BUY
      ? Number(globalLimits.maxFiatIn) - Number(globalLimits.usedLimit.usedFiatIn)
      : Number(globalLimits.maxFiatOut) - Number(globalLimits.usedLimit.usedFiatOut);

  if (Number(effectiveAmountUsd) > globalRemaining) {
    throw new APIError({ message: "Amount exceeds global limit.", status: httpStatus.BAD_REQUEST });
  }
}

export async function createAveniaOnrampTicket(
  taxId: string,
  quote: { id: string },
  amount: string,
  dependencies: AveniaRegistrationDependencies = defaultDependencies()
): Promise<{ brCode: string; aveniaTicketId: string }> {
  const aveniaCustomer = await dependencies.findAveniaCustomer(taxId);
  if (!aveniaCustomer) {
    throw new APIError({ message: "Subaccount not found.", status: httpStatus.BAD_REQUEST });
  }
  const subAccountId = aveniaCustomer.providerSubaccountId ?? "";
  const accountLimits = await dependencies.aveniaApi.getSubaccountUsedLimit(subAccountId);
  if (!accountLimits) {
    throw new APIError({ message: "Failed to fetch subaccount limits.", status: httpStatus.INTERNAL_SERVER_ERROR });
  }

  await validateAveniaLimits(amount, accountLimits.limitInfo.limits, RampDirection.BUY, taxId, dependencies);
  const aveniaQuote = await dependencies.aveniaApi.createPayInQuote({
    inputAmount: String(amount),
    inputCurrency: BrlaCurrency.BRL,
    inputPaymentMethod: AveniaPaymentMethod.PIX,
    inputThirdParty: false,
    outputCurrency: BrlaCurrency.BRLA,
    outputPaymentMethod: AveniaPaymentMethod.INTERNAL,
    outputThirdParty: false,
    subAccountId
  });
  const ticket = await dependencies.aveniaApi.createPixInputTicket(
    {
      quoteToken: aveniaQuote.quoteToken,
      ticketBlockchainOutput: { beneficiaryWalletId: "00000000-0000-0000-0000-000000000000" },
      ticketBrlPixInput: { additionalData: generateReferenceLabel(quote) }
    },
    subAccountId
  );

  return { aveniaTicketId: ticket.id, brCode: ticket.brCode };
}

export async function validateAveniaOfframpRecipient(
  taxId: string,
  pixKey: string,
  receiverTaxId: string,
  amount: string,
  dependencies: AveniaRegistrationDependencies = defaultDependencies()
): Promise<{ wallets: { evm: string }; brCode: string }> {
  const aveniaCustomer = await dependencies.findAveniaCustomer(taxId);
  if (!aveniaCustomer) {
    throw new APIError({ message: "Subaccount not found", status: httpStatus.BAD_REQUEST });
  }
  const subAccountId = aveniaCustomer.providerSubaccountId ?? "";
  const subaccount = await dependencies.aveniaApi.subaccountInfo(subAccountId);
  const accountLimits = await dependencies.aveniaApi.getSubaccountUsedLimit(subAccountId);
  if (!accountLimits) {
    throw new APIError({ message: "Failed to fetch subaccount limits", status: httpStatus.INTERNAL_SERVER_ERROR });
  }

  let pixKeyData;
  try {
    pixKeyData = await dependencies.aveniaApi.validatePixKey(pixKey);
  } catch (error) {
    logger.warn(
      `validateAveniaOfframpRecipient: pix-info lookup failed for pixKey=${pixKey}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw new APIError({ message: "Invalid pixKey or receiverTaxId.", status: httpStatus.BAD_REQUEST });
  }

  let masksMatch: boolean;
  try {
    masksMatch = validateMaskedNumber(pixKeyData.taxId, normalizeTaxId(receiverTaxId));
  } catch (error) {
    logger.warn(
      `validateAveniaOfframpRecipient: pix key owner taxId is not comparable to receiverTaxId. masked=${pixKeyData.taxId}, provided=${normalizeTaxId(receiverTaxId)}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw new APIError({ message: "Invalid pixKey or receiverTaxId.", status: httpStatus.BAD_REQUEST });
  }

  if (!masksMatch) {
    logger.warn(
      `validateAveniaOfframpRecipient: pix key owner taxId does not match receiverTaxId. masked=${pixKeyData.taxId}, provided=${normalizeTaxId(receiverTaxId)}`
    );
    throw new APIError({ message: "Invalid pixKey or receiverTaxId.", status: httpStatus.BAD_REQUEST });
  }

  await validateAveniaLimits(amount, accountLimits.limitInfo.limits, RampDirection.SELL, taxId, dependencies);
  const evmAddress = subaccount?.wallets.find(wallet => wallet.chain === "EVM")?.walletAddress;
  if (!evmAddress) {
    throw new APIError({ message: "EVM wallet not found in subaccount.", status: httpStatus.INTERNAL_SERVER_ERROR });
  }

  return { brCode: subaccount.brCode, wallets: { evm: evmAddress } };
}
