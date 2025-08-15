import { QuoteError } from "@packages/shared";
import { MoneriumErrors } from "@packages/shared/src/endpoints/monerium";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

/**
 * A utility hook to manage signature traces using localStorage.
 * This prevents a process from running more than once.
 */
export const useSignatureTrace = (traceKey: string) => {
  // Checks if a trace exists. If not, it creates one and allows the process to proceed.
  const checkAndSetTrace = useCallback(() => {
    const existingTrace = localStorage.getItem(traceKey);
    if (existingTrace !== null) {
      return { canProceed: false };
    }

    const traceRef = new Date().toISOString();
    localStorage.setItem(traceKey, traceRef);
    return { canProceed: true };
  }, [traceKey]);

  const releaseTrace = useCallback(() => {
    localStorage.removeItem(traceKey);
  }, [traceKey]);

  return { checkAndSetTrace, releaseTrace };
};

const RampRegistrationErrorMessages = {
  [MoneriumErrors.USER_MINT_ADDRESS_NOT_FOUND]: "hooks.useGetRampRegistrationErrorMessage.userMintAddressNotFound",
  [QuoteError.QuoteNotFound]: "hooks.useGetRampRegistrationErrorMessage.quoteNotFound"
};

export const useGetRampRegistrationErrorMessage = () => {
  const { t } = useTranslation();

  return useCallback(
    (error: unknown): string | undefined => {
      if (error instanceof Error) {
        if (error.message?.includes(MoneriumErrors.USER_MINT_ADDRESS_NOT_FOUND)) {
          return t(
            RampRegistrationErrorMessages[MoneriumErrors.USER_MINT_ADDRESS_NOT_FOUND] ||
              "hooks.useGetRampRegistrationErrorMessage.default"
          );
        }
        if (error.message?.includes(QuoteError.QuoteNotFound)) {
          return t(
            RampRegistrationErrorMessages[QuoteError.QuoteNotFound] || "hooks.useGetRampRegistrationErrorMessage.default"
          );
        }
      }
    },
    [t]
  );
};
