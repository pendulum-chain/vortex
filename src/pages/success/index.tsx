import { CheckIcon } from '@heroicons/react/20/solid';
import Telegram from '../../assets/telegram.svg';
import { TextInput } from '../../components/TextInput';
import { BaseLayout } from '../../layouts';
import { Box } from '../../components/Box';
import { useNavigate } from 'react-router-dom';
import { TransactionInfo } from '../../components/TransactionInfo';

const Checkmark = () => (
  <div className="flex items-center justify-center w-20 h-20 border-2 border-blue-700 rounded-full">
    <CheckIcon className="w-10 text-pink-500" />
  </div>
);

export const SuccessPage = () => {
  const navigate = useNavigate();
  const transaction = {
    id: '2137',
  };

  const main = (
    <main>
      <Box className="flex flex-col items-center justify-center mx-auto mt-12 ">
        <Checkmark />
        <h1 className="mt-6 text-2xl font-bold text-center text-blue-700">Request made successfully</h1>
        <TransactionInfo transactionId={transaction.id} />
        <p className="mt-6 text-center">Normal processing times are between 5 and 10 minutes.</p>
        <div className="h-0.5 m-auto w-1/5 bg-pink-500 mt-8 mb-5" />
        <p className="text-center text-gray-400">
          If your transaction is not completed after 60 minutes please contact support on:
        </p>
        <button className="transition hover:scale-105 overflow-hidden relative fadein-button-animation flex my-6  border-telegram rounded-xl py-1.5 px-3 border">
          <img src={Telegram} alt="Telegram" className="w-6 h-6" />
          <p className="ml-1 text-black">Telegram</p>
        </button>
        <p className="font-light text-center text-blue-700">
          To receive further assistance and information about our app,
        </p>
        <p className="font-light text-center text-blue-700">please provide your email address below:</p>
        <div className="w-full mt-2">
          <TextInput type="email" placeholder="example@mail.com" />
        </div>
        <button
          className="w-full mt-5 text-white bg-blue-700 btn rounded-xl"
          onClick={() => {
            navigate('/failure');
          }}
        >
          Return Home
        </button>
      </Box>
    </main>
  );

  return <BaseLayout main={main} />;
};
