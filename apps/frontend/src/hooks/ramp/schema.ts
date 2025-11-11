import { decodeAddress, encodeAddress } from "@polkadot/keyring";
import { hexToU8a, isHex } from "@polkadot/util";
import { CNPJ_REGEX, CPF_REGEX, FiatToken, isValidCnpj, isValidCpf, Networks, RampDirection } from "@vortexfi/shared";
import { useTranslation } from "react-i18next";
import * as Yup from "yup";
import { useQuote } from "../../stores/quote/useQuoteStore";
import { useRampDirection } from "../../stores/rampDirectionStore";

export type RampFormValues = {
  taxId?: string;
  pixId?: string;
  walletAddress?: string;
  moneriumWalletAddress?: string;
};

export const PHONE_REGEX = /^\+[1-9][0-9]\d{1,14}$/;
export const EMAIL_REGEX =
  /^(([^<>()[\]\\.,;:\s@"]+(.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
export const RANDOM_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

// Regex adopted from here https://developers.international.pagseguro.com/reference/pix-key-validation-and-regex-1
const pixKeyRegex = [CPF_REGEX, CNPJ_REGEX, PHONE_REGEX, EMAIL_REGEX, RANDOM_REGEX];

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

const isValidEvmAddress = (address: string) => {
  return /^(0x)?[0-9a-f]{40}$/i.test(address);
};

export const createRampFormSchema = (
  t: (key: string) => string,
  rampDirection: RampDirection,
  requiresWalletAddress: "substrate" | "evm" | false
) => {
  return Yup.object<RampFormValues>().shape({
    pixId: Yup.string().when("fiatToken", {
      is: (value: FiatToken) => value === FiatToken.BRL && rampDirection === RampDirection.SELL,
      otherwise: schema => schema.optional(),
      then: schema =>
        schema
          .required(t("components.swap.validation.pixId.required"))
          .test("matches-one", t("components.swap.validation.pixId.format"), value => {
            if (!value) return false;
            return pixKeyRegex.some(regex => regex.test(value));
          })
    }),
    taxId: Yup.string().when("fiatToken", {
      is: (value: FiatToken) => value === FiatToken.BRL,
      otherwise: schema => schema.optional(),
      then: schema =>
        schema
          .required(t("components.swap.validation.taxId.required"))
          .test("matches-one", t("components.swap.validation.taxId.format"), value => {
            if (!value) return false;
            return isValidCnpj(value) || isValidCpf(value);
          })
    }),
    walletAddress: Yup.string()
      .test("is-valid-evm-address", t("components.swap.validation.walletAddress.formatEvm"), value => {
        if (!requiresWalletAddress || requiresWalletAddress === "substrate") return true;
        if (!value) return false;
        if (requiresWalletAddress === "evm") return isValidEvmAddress(value);
      })
      .test("is-valid-substrate-address", t("components.swap.validation.walletAddress.formatSubstrate"), value => {
        if (!requiresWalletAddress || requiresWalletAddress === "evm") return true;
        if (!value) return false;
        if (requiresWalletAddress === "substrate") return isValidPolkadotAddress(value);
      })
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
