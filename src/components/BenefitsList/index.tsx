import { CheckIcon } from '@heroicons/react/20/solid';
import { FC } from 'react';
import Big from 'big.js';
import { Trans, useTranslation } from 'react-i18next';

interface BenefitsListProps {
  amount: Big | undefined;
  currency: string;
}

export const BenefitsList: FC<BenefitsListProps> = () => {
  const { t } = useTranslation();

  return (
    <ul>
      <li className="flex">
        <CheckIcon className="w-4 mr-2 text-pink-500" />
        <p>{t('components.benefitsList.noHiddenFees')}</p>
      </li>
      <li className="flex">
        <CheckIcon className="w-4 mr-2 text-pink-500" />
        <p>
          <Trans i18nKey="components.benefitsList.takes5Minutes">
            Takes <span className="font-bold text-blue-700">5 minutes</span>
          </Trans>
        </p>
      </li>
    </ul>
  );
};
