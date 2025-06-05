import { CheckIcon } from '@heroicons/react/20/solid';
import { useTranslation } from 'react-i18next';

import { FiatToken } from 'shared';
import { Box } from '../../components/Box';
import { EmailForm } from '../../components/EmailForm';
import { Rating } from '../../components/Rating';
import { useRampSubmission } from '../../hooks/ramp/useRampSubmission';
import { useRampFormStore } from '../../stores/ramp/useRampFormStore';
import { useRampDirection } from '../../stores/rampDirectionStore';
import { useRampExecutionInput } from '../../stores/rampStore';

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
  const rampDirection = useRampDirection();
  const isOnramp = rampDirection === 'onramp';

  const transactionId = executionInput?.quote?.id;

  const ARRIVAL_TEXT_BY_TOKEN: Record<FiatToken, string> = {
    [FiatToken.EURC]: t('pages.success.arrivalText.sell.EURC'),
    [FiatToken.ARS]: t('pages.success.arrivalText.sell.ARS'),
    [FiatToken.BRL]: t('pages.success.arrivalText.sell.BRL'),
  };

  const arrivalTextBuy = t('pages.success.arrivalText.buy');
  const arrivalTextSell = ARRIVAL_TEXT_BY_TOKEN[fiatToken] || t('pages.success.arrivalText.sell.default');

  return (
    <main>
      <Box className="flex flex-col justify-center mx-auto mt-12 ">
        <div className="flex justify-center w-full">
          <Checkmark />
        </div>
        <div className="w-full mt-6 px-4 md:px-8">
          {' '}
          <h1 className="mb-6 text-2xl font-bold text-left text-blue-700">
            {t(`pages.success.title.${isOnramp ? 'buy' : 'sell'}`)}
          </h1>{' '}
          <p className="text-left font-light text-blue-700 leading-relaxed mb-8">
            {isOnramp ? arrivalTextBuy : arrivalTextSell}
          </p>{' '}
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
