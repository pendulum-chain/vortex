import { CheckIcon } from '@heroicons/react/20/solid';
import { useTranslation } from 'react-i18next';

import { Box } from '../../components/Box';
import { EmailForm } from '../../components/EmailForm';
import { Rating } from '../../components/Rating';
import { FiatToken } from 'shared';
import { useRampSubmission } from '../../hooks/ramp/useRampSubmission';
import { useRampExecutionInput } from '../../stores/rampStore';
import { useRampFormStore } from '../../stores/ramp/useRampFormStore';

const Checkmark = () => (
  <div className="flex items-center justify-center w-20 h-20 border-2 border-blue-700 rounded-full">
    <CheckIcon className="w-10 text-blue-700" /> {/* Changed pink to blue */}
  </div>
);

export const SuccessPage = () => {
  const { t } = useTranslation();
  const { finishOfframping } = useRampSubmission();
  const executionInput = useRampExecutionInput();
  const { fiatToken } = useRampFormStore();

  const transactionId = executionInput?.quote?.id;

  const ARRIVAL_TEXT_BY_TOKEN: Record<FiatToken, string> = {
    [FiatToken.EURC]: t('pages.success.arrivalText.EURC'),
    [FiatToken.ARS]: t('pages.success.arrivalText.ARS'),
    [FiatToken.BRL]: t('pages.success.arrivalText.BRL'),
  };

  const arrivalText = ARRIVAL_TEXT_BY_TOKEN[fiatToken] || t('pages.success.arrivalText.default');

  return (
    <main>
      {/* Removed items-center from Box for overall container */}
      <Box className="flex flex-col justify-center mx-auto mt-12 ">
        {/* Centering container for Checkmark */}
        <div className="flex justify-center w-full">
          <Checkmark />
        </div>
        {/* Wrapper div for left-aligned content with padding */}
        <div className="w-full mt-6 px-4 md:px-8"> {/* Added padding to match EmailForm */}
          <h1 className="mb-6 text-2xl font-bold text-left text-blue-700">{t('pages.success.title')}</h1> {/* Changed text-center to text-left */}
          {/* Removed pink divider */}
          <p className="text-left font-light text-blue-700 leading-relaxed mb-8">{arrivalText}</p> {/* Changed text-center to text-left, updated color/style */}
          <div className="h-0.5 m-auto w-1/5 bg-pink-500 mt-8 mb-5" />
          <EmailForm transactionId={transactionId} transactionSuccess={true} />
        </div>
        <button className="w-full mt-5 btn-vortex-primary btn rounded-xl" onClick={finishOfframping}>
          {t('pages.success.returnHome')}
        </button>
      </Box>
      <Rating />
    </main>
  );
};
