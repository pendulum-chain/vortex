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
        setTermsError={setTermsError}
        termsAccepted={termsAccepted}
        termsChecked={termsChecked}
        termsError={termsError}
        toggleTermsChecked={toggleTermsChecked}
      />
    </section>
  );
};
