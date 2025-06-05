import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../helpers/cn';

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
        {isFormSubmitted ? t('components.rating.thankYou') : t('components.rating.howWouldYouRateYourExperience')}
      </h2>
      <form className={cn('rating rating-lg mt-2.5 pb-5 flex flex-row-reverse', isFormSubmitted && 'rating-checked')}>
        <AnimatePresence>
          <input type="radio" defaultChecked name="rating" className="hidden" />
          {ratings.filter(filterRatingsBasedOnUserInput).map((ratingValue, index) => (
            <motion.input
              className={cn('transition bg-orange-400 mask mask-star-2', index !== 0 && 'mr-2.5')}
              value={ratingValue}
              key={ratingValue}
              type="radio"
              name="rating"
              onClick={() => onSubmit(ratingValue)}
              exit={{ scale: 0, y: 300, rotate: 360 }}
            />
          ))}
        </AnimatePresence>
      </form>
    </>
  );
};
