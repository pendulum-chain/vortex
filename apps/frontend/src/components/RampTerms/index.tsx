import {
  useTermsAccepted,
  useTermsActions,
  useTermsAnimationKey,
  useTermsChecked,
  useTermsError,
} from '../../stores/termsStore';
import { TermsAndConditions } from '../TermsAndConditions';

export const RampTerms = () => {
  const termsChecked = useTermsChecked();
  const termsAccepted = useTermsAccepted();
  const termsError = useTermsError();
  const termsAnimationKey = useTermsAnimationKey();

  const { toggleTermsChecked, setTermsError } = useTermsActions();

  return (
    <section className="w-full mt-5">
      <TermsAndConditions
        key={termsAnimationKey}
        toggleTermsChecked={toggleTermsChecked}
        termsChecked={termsChecked}
        termsAccepted={termsAccepted}
        termsError={termsError}
        setTermsError={setTermsError}
      />
    </section>
  );
};
