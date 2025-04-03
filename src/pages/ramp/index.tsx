import { useOfframp } from '../swap/hooks/useOfframp';

import { FailurePage } from '../failure';
import { ProgressPage } from '../progress';
import { SuccessPage } from '../success';
import { SwapPage } from '../swap';

export const Ramp = () => {
  const { isSuccessPage, isFailurePage, isProgressPage } = useOfframp();

  if (isProgressPage) {
    return <ProgressPage />;
  }

  if (isSuccessPage) {
    return <SuccessPage />;
  }

  if (isFailurePage) {
    return <FailurePage />;
  }

  return <SwapPage />;
};
