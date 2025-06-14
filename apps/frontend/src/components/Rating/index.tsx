import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { validator } from 'web3';

import { useVortexAccount } from '../../hooks/useVortexAccount';
import { CloseButton } from '../buttons/CloseButton';
import { RatingForm } from './RatingForm';
import { useRatingVisibility } from './useRatingVisibility';
import './index.css';
import { RatingService } from '../../services/api';

export function Rating() {
  const { t } = useTranslation();
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
    mutationFn: async (data: { rating: number; walletAddress: string }) => {
      return RatingService.storeRating(data.rating, data.walletAddress);
    },
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
                  <h1 className="text-lg sm:text-2xl">{t('components.rating.title')}</h1>
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
