import { TermsAndConditions } from '../../../components/TermsAndConditions';
import {
  useTermsChecked,
  useTermsAccepted,
  useTermsError,
  useTermsAnimationKey,
  useTermsActions,
} from '../../../stores/termsStore';

export const TermsSection: React.FC = () => {
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
