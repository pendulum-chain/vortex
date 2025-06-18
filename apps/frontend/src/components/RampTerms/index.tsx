import {
  useTermsAccepted,
  useTermsActions,
  useTermsAnimationKey,
  useTermsChecked,
  useTermsError
} from "../../stores/termsStore";
import { TermsAndConditions } from "../TermsAndConditions";

export const RampTerms = () => {
  const termsChecked = useTermsChecked();
  const termsAccepted = useTermsAccepted();
  const termsError = useTermsError();
  const termsAnimationKey = useTermsAnimationKey();

  const { toggleTermsChecked, setTermsError } = useTermsActions();

  return (
    <section className="mt-5 w-full">
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
