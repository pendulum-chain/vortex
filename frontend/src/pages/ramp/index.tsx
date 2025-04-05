import { FailurePage } from '../failure';
import { ProgressPage } from '../progress';
import { SuccessPage } from '../success';
import { RampForm } from '../ramp-form';

export const Ramp = () => {
  const { isSuccessPage, isFailurePage, isProgressPage } = useRampPageStatus();

  if (isProgressPage) {
    return <ProgressPage />;
  }

  if (isSuccessPage) {
    return <SuccessPage />;
  }

  if (isFailurePage) {
    return <FailurePage />;
  }

  return <RampForm />;
};
