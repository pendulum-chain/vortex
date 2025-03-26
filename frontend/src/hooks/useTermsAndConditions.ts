import { useState } from 'react';
import { useLocalStorage } from './useLocalStorage';

export const useTermsAndConditions = () => {
  const { set, state } = useLocalStorage<string | undefined>({ key: 'TERMS_AND_CONDITIONS' });

  // Terms and Conditions are accepted only when user has submitted the swap in `confirmSwap.ts`
  const [termsAccepted, setTermsAccepted] = useState<boolean>(state === 'accepted');

  // termsChecked is used to determine if the Terms and Conditions checkbox is checked and the Swap form can be submitted in `swap/index.tsx`
  const [termsChecked, setTermsChecked] = useState<boolean>(false);

  const [termsError, setTermsError] = useState<boolean>(false);

  const toggleTermsChecked = () => {
    setTermsChecked((state) => !state);
  };

  return {
    termsChecked,
    toggleTermsChecked,
    termsAccepted,
    setTermsAccepted: (accepted: boolean) => {
      set(accepted ? 'accepted' : undefined);
      setTermsAccepted(accepted);
    },
    termsError,
    setTermsError,
  };
};
