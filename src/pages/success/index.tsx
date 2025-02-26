import { CheckIcon } from '@heroicons/react/20/solid';
import { BaseLayout } from '../../layouts';
import { Box } from '../../components/Box';
import { EmailForm } from '../../components/EmailForm';
import { Rating } from '../../components/Rating';
import { OutputTokenType } from '../../constants/tokenConfig';

const Checkmark = () => (
  <div className="flex items-center justify-center w-20 h-20 border-2 border-blue-700 rounded-full">
    <CheckIcon className="w-10 text-pink-500" />
  </div>
);

interface SuccessPageProps {
  finishOfframping: () => void;
  transactionId: string | undefined;
  toToken: OutputTokenType;
}

export const SuccessPage = ({ finishOfframping, transactionId, toToken }: SuccessPageProps) => {
  const eurcArrivalText =
    'Funds will be received in 1 min (Instant SEPA) or 2 days (Standard SEPA). SEPA type dependent on the recipient bank support.';
  const arsArrivalText = 'Your funds will arrive in your bank account in a few minutes.';
  const arrivalText = toToken === OutputTokenType.EURC ? eurcArrivalText : arsArrivalText;
  const main = (
    <main>
      <Box className="flex flex-col items-center justify-center mx-auto mt-12 ">
        <Checkmark />
        <h1 className="mt-6 text-2xl font-bold text-center text-blue-700">
          All set! The withdrawal has been sent to your bank.
        </h1>
        <div className="h-0.5 m-auto w-1/5 bg-pink-500 mt-8 mb-5" />
        <p className="text-center text-gray-400">{arrivalText}</p>
        <div className="h-0.5 m-auto w-1/5 bg-pink-500 mt-8 mb-5" />
        <EmailForm transactionId={transactionId} transactionSuccess={true} />
        <button className="w-full mt-5 btn-vortex-primary btn rounded-xl" onClick={finishOfframping}>
          Return Home
        </button>
      </Box>
      <Rating />
    </main>
  );

  return <BaseLayout main={main} />;
};
