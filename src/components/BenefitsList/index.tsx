import { CheckIcon } from '@heroicons/react/20/solid';
export const BenefitsList = () => (
  <ul>
    <li className="flex">
      <CheckIcon className="w-4 text-pink-500 mr-2" />
      <p>
        You could save <span className="font-bold text-blue-700">up to 43.74 USD</span>
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
