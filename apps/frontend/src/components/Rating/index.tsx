import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { validator } from "web3";

import { useVortexAccount } from "../../hooks/useVortexAccount";
import { CloseButton } from "../buttons/CloseButton";
import { RatingForm } from "./RatingForm";
import { useRatingVisibility } from "./useRatingVisibility";
import "./index.css";
import { RatingService } from "../../services/api";

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
    isSuccess
  } = useMutation({
    mutationFn: async (data: { rating: number; walletAddress: string }) => {
      return RatingService.storeRating(data.rating, data.walletAddress);
    }
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
          animate={{ y: 0 }}
          className="toast right-0 left-0 transition"
          exit={{ y: 200 }}
          initial={{ y: 200 }}
          key="rating-toast"
          whileHover={{ scale: 1.02 }}
        >
          <div className="mx-auto w-full max-w-[800px] sm:w-3/4">
            <div className="rounded border border-neutral-200 bg-white shadow-2xl">
              <section className="px-6 py-5">
                <div className="flex w-full justify-between">
                  <h1 className="text-lg sm:text-2xl">{t("components.rating.title")}</h1>
                  <CloseButton onClick={onClose} />
                </div>
                <div className="mt-10 flex w-full flex-wrap items-center justify-center">
                  <RatingForm isFormSubmitted={isPending || isSuccess || isError} onSubmit={onSubmit} rating={rating} />
                </div>
              </section>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
