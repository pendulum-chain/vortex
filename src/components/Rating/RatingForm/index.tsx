import { motion, AnimatePresence } from 'framer-motion';

// From the highest to the lowest rating - because of ".rating input:hover ~ input" in ./index.css
const ratings = [5, 4, 3, 2, 1];

interface RatingFormProps {
  onSubmit: (ratingValue: number) => void;
  isFormSubmitted: boolean;
  rating: number;
}

const RatingForm: React.FC<RatingFormProps> = ({ onSubmit, isFormSubmitted, rating }) => {
  const filterRatingsBasedOnUserInput = (r: number) => !isFormSubmitted || (isFormSubmitted && r <= rating);

  return (
    <>
      <h2 className="w-full text-center text-md sm:text-lg">
        {isFormSubmitted ? 'Thank you!' : 'How would you rate your experience?'}
      </h2>
      <form className={`rating rating-lg mt-2.5 pb-5 flex flex-row-reverse ${isFormSubmitted ? 'rating-checked' : ''}`}>
        <AnimatePresence>
          <input type="radio" defaultChecked name="rating" className="hidden" />
          {ratings.filter(filterRatingsBasedOnUserInput).map((ratingValue, index) => (
            <motion.input
              className={`transition bg-orange-400 mask mask-star-2 ${index !== 0 ? 'mr-2.5' : ''}`}
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

export default RatingForm;
