import { FC } from 'preact/compat';
import { CheckIcon } from '@heroicons/react/20/solid';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { Dialog } from '../../Dialog';
import Telegram from '../../../assets/telegram.svg';
import { TextInput } from '../../TextInput';
import { useClipboard } from '../../../hooks/useClipboard';

interface SuccessModalProps {
  visible: boolean;
  onClose: () => void;
  transaction: {
    id: string;
  };
}

const Checkmark = () => (
  <div className="flex items-center justify-center w-20 h-20 border-2 border-blue-700 rounded-full">
    <CheckIcon className="w-10 text-pink-500" />
  </div>
);

export const SuccessModal: FC<SuccessModalProps> = ({ onClose, visible, transaction = { id: '4325567934' } }) => {
  const clipboard = useClipboard();

  const content = (
    <article className="flex flex-col items-center justify-center ">
      <Checkmark />
      <h1 className="mt-6 text-2xl font-bold text-center text-blue-700">Request made successfully</h1>
      <div className="flex items-center justify-center">
        <p className="text-sm text-gray-400">Transaction ID: {transaction.id}</p>
        <button
          onClick={() => clipboard.copyToClipboard(transaction.id)}
          type="button"
          className="flex items-center justify-center w-5 h-5 ml-1 transition border border-gray-400 rounded-full cursor-pointer hover:border-black hover:text-black hover:scale-105"
        >
          <ClipboardDocumentIcon className="w-4" />
        </button>
      </div>
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
        To receive further assistance and information about our app, please provide your email address below:
      </p>
      <div className="w-full mt-2">
        <TextInput type="email" placeholder="example@mail.com" />
      </div>
      <button className="w-full mt-5 text-white bg-blue-700 btn rounded-xl">Return Home</button>
    </article>
  );

  return <Dialog onClose={onClose} visible={visible} content={content} />;
};
