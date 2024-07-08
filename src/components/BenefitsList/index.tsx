import { CheckIcon } from '@heroicons/react/20/solid';
import { FC } from 'preact/compat';

const SAVE_AMOUNT_PERCENT = 0.03;

interface BenefitsListProps {
  amount: number;
  currency: string;
}

export const BenefitsList: FC<BenefitsListProps> = ({ amount, currency }) => (
  <ul>
    <li className="flex">
      <CheckIcon className="w-4 text-pink-500 mr-2" />
      <p>
        You could save{' '}
        <span className="font-bold text-blue-700">
          up to {Number(SAVE_AMOUNT_PERCENT * amount).toFixed(2)} {currency.toUpperCase()}
        </span>
      </p>
    </li>
    <li className="flex">
      <CheckIcon className="w-4 text-pink-500 mr-2" />
      <p>
        Should arrive in <span className="font-bold text-blue-700">5 minutes</span>
      </p>
    </li>
    <li className="flex">
      <CheckIcon className="w-4 text-pink-500 mr-2" />
      <p>
        <span className="font-bold text-blue-700">Verify super fast</span> with your Tax ID
      </p>
    </li>
  </ul>
);
