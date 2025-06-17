import { useCallback, useEffect, useState } from "react";
import { storageKeys } from "../../constants/localStorage";
import { useRampFormStoreActions } from "../../stores/ramp/useRampFormStore";

import { useTaxId } from "../../stores/ramp/useRampFormStore";

export const useBrlaKycTaxIdLocalStorage = () => {
  const storeTaxId = useTaxId();

  const { setTaxId: setStoreTaxId } = useRampFormStoreActions();

  const [localStorageTaxId, setLocalStorageTaxId] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem(storageKeys.BRLA_KYC_TAX_ID) || undefined;
    } catch (error) {
      console.error("Error loading taxId from localStorage:", error);
      return undefined;
    }
  });

  useEffect(() => {
    if (storeTaxId) {
      localStorage.setItem(storageKeys.BRLA_KYC_TAX_ID, storeTaxId);
    }
  }, [storeTaxId]);

  const setTaxId = useCallback(
    (newTaxId: string | undefined) => {
      setLocalStorageTaxId(newTaxId);
      if (newTaxId) {
        setStoreTaxId(newTaxId);
      }
    },
    [setStoreTaxId]
  );

  const clearTaxId = () => {
    localStorage.removeItem(storageKeys.BRLA_KYC_TAX_ID);
  };

  const finalTaxId = storeTaxId || localStorageTaxId;

  return { taxId: finalTaxId, setTaxId, clearTaxId };
};
