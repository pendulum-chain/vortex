import { CheckIcon } from '@heroicons/react/20/solid';
import { FC } from 'preact/compat';
import Big from 'big.js';

interface BenefitsListProps {
  amount: Big | undefined;
  currency: string;
}

export const BenefitsList: FC<BenefitsListProps> = () => (
  <ul>
    <li className="flex">
      <CheckIcon className="w-4 mr-2 text-pink-500" />
      <p>No hidden fees</p>
    </li>
    <li className="flex">
      <CheckIcon className="w-4 mr-2 text-pink-500" />
      <p>
        Takes <span className="font-bold text-blue-700">5 minutes</span>
      </p>
    </li>
  </ul>
);
