import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
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

const starVariants = {
  exit: {
    opacity: 0,
    rotate: 180,
    scale: 0,
    transition: {
      duration: 0.5,
      ease: "easeInOut"
    },
    y: 50
  },
  hover: {
    opacity: 1,
    scale: 1.15,
    transition: {
      duration: 0.2,
      ease: "easeOut"
    }
  },
  initial: {
    opacity: 0.2,
    rotate: 0,
    scale: 1
  },
  selected: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.3,
      ease: "easeOut"
    }
  },
  tap: {
    scale: 0.9,
    transition: {
      duration: 0.1,
      ease: "easeInOut"
    }
  }
};

export const RatingForm: React.FC<RatingFormProps> = ({ onSubmit, isFormSubmitted, rating }) => {
  const { t } = useTranslation();
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);

  const handleStarClick = (ratingValue: number) => {
    if (!isFormSubmitted) {
      onSubmit(ratingValue);
    }
  };

  const getStarState = (starValue: number) => {
    if (isFormSubmitted) {
      return "selected";
    }

    if (hoveredRating !== null) {
      return starValue <= hoveredRating ? "hover" : "initial";
    }

    return "initial";
  };

  // Only show stars that should be visible
  const visibleStars = ratings.filter(starValue => {
    if (!isFormSubmitted) return true;
    return starValue <= rating;
  });

  return (
    <>
      <h2 className="w-full text-center text-md sm:text-lg">
        {isFormSubmitted ? t("components.rating.thankYou") : t("components.rating.howWouldYouRateYourExperience")}
      </h2>
      <div className={cn("rating rating-lg mt-2.5 flex flex-row-reverse pb-5", isFormSubmitted && "rating-checked")}>
        <input className="hidden" defaultChecked name="rating" type="radio" />

        <AnimatePresence mode="popLayout">
          {visibleStars.map((ratingValue, index) => (
            <motion.input
              animate={getStarState(ratingValue)}
              className={cn(
                "mask mask-star-2 bg-orange-400",
                !isFormSubmitted && "cursor-pointer",
                index !== 0 && "mr-2.5",
                isFormSubmitted ? "pointer-events-none" : "pointer-events-auto"
              )}
              exit="exit"
              initial="initial"
              key={`star-${ratingValue}`}
              layout
              name="rating"
              onClick={() => handleStarClick(ratingValue)}
              onMouseEnter={() => !isFormSubmitted && setHoveredRating(ratingValue)}
              onMouseLeave={() => !isFormSubmitted && setHoveredRating(null)}
              type="radio"
              value={ratingValue}
              variants={starVariants}
              whileTap={!isFormSubmitted ? "tap" : undefined}
            />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
};
