import { useMutation } from '@tanstack/react-query';
import { storeUserRatingInBackend } from '../../services/storage/remote';
import { motion } from 'framer-motion';
import './index.css';
import { CloseButton } from '../buttons/CloseButton';

const ratings = [5, 4, 3, 2, 1];

export function Rating() {
  const {
    mutate: saveUserRatingMutation,
    isPending,
    isSuccess,
    isError,
  } = useMutation({
    mutationFn: storeUserRatingInBackend,
  });

  const onSubmit = (event: Event) => {
    saveUserRatingMutation({ rating: (event.target as EventTarget).value });
  };

  const onClose = () => null;

  const renderFormContent = () => {
    if (isPending) {
      return (
        <>
          <h2 className="w-full text-lg text-center">Thank you!</h2>
        </>
      );
    }
    return (
      <>
        <h2 className="w-full text-lg text-center">How would you rate out interface?</h2>
        <form className="rating rating-lg mt-2.5 pb-5 flex flex-row-reverse">
          <input type="radio" defaultChecked name="rating" className="hidden" />
          {ratings.map((rating, index) => (
            <input
              key={index}
              type="radio"
              value={rating}
              name="rating"
              onClick={onSubmit}
              className="mr-2.5 bg-orange-400 mask mask-star-2 transition"
            />
          ))}
        </form>
      </>
    );
  };

  return (
    <motion.div
      initial={{ y: 200 }}
      animate={{ y: 0 }}
      exit={{ y: 200 }}
      whileHover={{ scale: 1.05 }}
      className="left-0 right-0 w-3/4 mx-auto transition toast"
      transformTemplate={(_: { translate: string }, transform: string) => (transform === 'none' ? '' : transform)}
    >
      <div className="bg-white border rounded shadow-2xl border-neutral-200">
        <section className="px-6 py-5">
          <div className="flex justify-between w-full">
            <h1 className="text-2xl">Your opinion matters!</h1>
            <CloseButton onClick={onClose} />
          </div>
          <div className="flex flex-wrap items-center justify-center w-full mt-10">{renderFormContent()}</div>
        </section>
      </div>
    </motion.div>
  );
}
