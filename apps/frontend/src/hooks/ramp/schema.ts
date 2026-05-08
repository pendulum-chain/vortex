import { decodeAddress, encodeAddress } from "@polkadot/keyring";
import { hexToU8a, isHex } from "@polkadot/util";
import { CNPJ_REGEX, CPF_REGEX, FiatToken, isValidCnpj, isValidCpf, Networks, RampDirection } from "@vortexfi/shared";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useQuote } from "../../stores/quote/useQuoteStore";
import { useRampDirection } from "../../stores/rampDirectionStore";

export type RampFormValues = {
  taxId?: string;
  pixId?: string;
  walletAddress?: string;
  moneriumWalletAddress?: string;
  fiatToken?: FiatToken;
};

const pixKeySchema = z.union([
  z.string().regex(CPF_REGEX),
  z.string().regex(CNPJ_REGEX),
  z.string().regex(/^\+[1-9][0-9]\d{1,14}$/),
  z.email(),
  z.guid()
]);

const evmAddressSchema = z.string().regex(/^(0x)?[0-9a-f]{40}$/i);

const isValidPolkadotAddress = (address: string) => {
  try {
    const result = encodeAddress(isHex(address) ? hexToU8a(address) : decodeAddress(address));

    console.log("Valid address:", address, "->", result);
    return true;
  } catch (_error) {
    console.error("Invalid address:", address, _error);
    return false;
  }
};

export const createRampFormSchema = (
  t: (key: string) => string,
  rampDirection: RampDirection,
  requiresWalletAddress: "substrate" | "evm" | false
) => {
  return z
    .object({
      fiatToken: z.string().optional() as z.ZodType<FiatToken | undefined>,
      moneriumWalletAddress: z.string().optional(),
      pixId: z.string().optional(),
      taxId: z.string().optional(),
      walletAddress: z.string().optional()
    })
    .superRefine((data, ctx) => {
      if (data.fiatToken === FiatToken.BRL && rampDirection === RampDirection.SELL) {
        const { pixId } = data;
        if (!pixId) {
          ctx.addIssue({
            code: "custom",
            message: t("components.swap.validation.pixId.required"),
            path: ["pixId"]
          });
        } else if (!pixKeySchema.safeParse(pixId).success) {
          ctx.addIssue({ code: "custom", message: t("components.swap.validation.pixId.format"), path: ["pixId"] });
        }
      }
      if (data.fiatToken === FiatToken.BRL) {
        const { taxId } = data;
        if (!taxId) {
          ctx.addIssue({
            code: "custom",
            message: t("components.swap.validation.taxId.required"),
            path: ["taxId"]
          });
        } else if (!isValidCnpj(taxId) && !isValidCpf(taxId)) {
          ctx.addIssue({ code: "custom", message: t("components.swap.validation.taxId.format"), path: ["taxId"] });
        }
      }
      if (requiresWalletAddress === "evm") {
        const { walletAddress } = data;
        if (!walletAddress || !evmAddressSchema.safeParse(walletAddress).success) {
          ctx.addIssue({
            code: "custom",
            message: t("components.swap.validation.walletAddress.formatEvm"),
            path: ["walletAddress"]
          });
        }
      }
      if (requiresWalletAddress === "substrate") {
        const { walletAddress } = data;
        if (!walletAddress || !isValidPolkadotAddress(walletAddress)) {
          ctx.addIssue({
            code: "custom",
            message: t("components.swap.validation.walletAddress.formatSubstrate"),
            path: ["walletAddress"]
          });
        }
      }
    });
};

export const useSchema = () => {
  const { t } = useTranslation();
  const rampDirection = useRampDirection();
  const quote = useQuote();
  const requiresWalletAddress =
    quote?.rampType === RampDirection.BUY ? (quote?.to === Networks.AssetHub ? "substrate" : "evm") : false;

  return createRampFormSchema(t, rampDirection, requiresWalletAddress);
};
