import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { cn } from "../../../helpers/cn";

// From the highest to the lowest rating - because of ".rating input:hover ~ input" in ./index.css
// https://developer.mozilla.org/en-US/docs/Web/CSS/Subsequent-sibling_combinator
const ratings = [5, 4, 3, 2, 1];

interface RatingFormProps {
  onSubmit: (ratingValue: number) => void;
  isFormSubmitted: boolean;
  rating: number;
}

export const RatingForm: React.FC<RatingFormProps> = ({ onSubmit, isFormSubmitted, rating }) => {
  const filterRatingsBasedOnUserInput = (r: number) => !isFormSubmitted || (isFormSubmitted && r <= rating);
  const { t } = useTranslation();

  return (
    <>
      <h2 className="w-full text-center text-md sm:text-lg">
        {isFormSubmitted ? t("components.rating.thankYou") : t("components.rating.howWouldYouRateYourExperience")}
      </h2>
      <form className={cn("rating rating-lg mt-2.5 flex flex-row-reverse pb-5", isFormSubmitted && "rating-checked")}>
        <AnimatePresence>
          <input className="hidden" defaultChecked name="rating" type="radio" />
          {ratings.filter(filterRatingsBasedOnUserInput).map((ratingValue, index) => (
            <motion.input
              className={cn("mask mask-star-2 bg-orange-400 transition", index !== 0 && "mr-2.5")}
              exit={{ rotate: 360, scale: 0, y: 300 }}
              key={ratingValue}
              name="rating"
              onClick={() => onSubmit(ratingValue)}
              type="radio"
              value={ratingValue}
            />
          ))}
        </AnimatePresence>
      </form>
    </>
  );
};
