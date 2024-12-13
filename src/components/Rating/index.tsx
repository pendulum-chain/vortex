import { useEffect, useState } from 'preact/hooks';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { validator } from 'web3';

import { storeUserRatingInBackend } from '../../services/storage/remote';
import { CloseButton } from '../buttons/CloseButton';
import { useRatingVisibility } from './useRatingVisibility';
import RatingForm from './RatingForm';
import './index.css';

export function Rating() {
  const { isVisible, onClose } = useRatingVisibility();
  const { address: walletAddress } = useVortexAccount();
  const [rating, setRating] = useState(0);

  const isValidAddress = !!walletAddress && validator.isAddress(walletAddress);

  const {
    mutate: saveUserRatingMutation,
    isPending,
    isError,
    isSuccess,
  } = useMutation({
    mutationFn: storeUserRatingInBackend,
  });

  useEffect(() => {
    if (isSuccess || isError) {
      onClose();
    }
  }, [isError, isSuccess, onClose]);

  const onSubmit = (ratingValue: number) => {
    if (isValidAddress) {
      setRating(ratingValue);
      saveUserRatingMutation({ rating: ratingValue, walletAddress });
    }
  };

  const isConnectedAndIsVisible = isValidAddress && isVisible;

  return (
    <AnimatePresence>
      {isConnectedAndIsVisible && (
        <motion.div
          key="rating-toast"
          initial={{ y: 200 }}
          animate={{ y: 0 }}
          exit={{ y: 200 }}
          whileHover={{ scale: 1.02 }}
          className="left-0 right-0 transition toast"
        >
          <div className="w-full sm:w-3/4 mx-auto max-w-[800px]">
            <div className="bg-white border rounded shadow-2xl border-neutral-200">
              <section className="px-6 py-5">
                <div className="flex justify-between w-full">
                  <h1 className="text-lg sm:text-2xl">Your opinion matters!</h1>
                  <CloseButton onClick={onClose} />
                </div>
                <div className="flex flex-wrap items-center justify-center w-full mt-10">
                  <RatingForm onSubmit={onSubmit} isFormSubmitted={isPending || isSuccess || isError} rating={rating} />
                </div>
              </section>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
