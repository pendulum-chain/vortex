import { FailurePage } from '../failure';
import { ProgressPage } from '../progress';
import { SuccessPage } from '../success';
import { RampForm } from '../ramp-form';
import { useRampNavigation } from '../../hooks/ramp/useRampNavigation';

export const Ramp = () => {

  const { getCurrentComponent } = useRampNavigation(
    <SuccessPage />,
    <FailurePage />,
    <ProgressPage />,
    <RampForm />
  );

  return getCurrentComponent();
};
