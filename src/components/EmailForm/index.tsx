import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { storeUserEmailInBackend } from '../../services/storage/remote';
import { TextInput } from '../TextInput';
import { useEventsContext } from '../../contexts/events';

interface EmailFormProps {
  transactionId?: string;
  // Boolean to check if the transaction was successful, important for the event tracking
  transactionSuccess: boolean;
}

export const EmailForm = ({ transactionId, transactionSuccess }: EmailFormProps) => {
  const { register, handleSubmit } = useForm();
  const { trackEvent } = useEventsContext();

  const {
    mutate: saveUserEmailMutation,
    isPending,
    isSuccess,
    isError,
  } = useMutation({
    mutationFn: storeUserEmailInBackend,
  });

  const onSubmit = handleSubmit((data) => {
    if (!transactionId) {
      console.error('Transaction ID is missing');
      return;
    }

    trackEvent({ event: 'email_submission', transaction_status: transactionSuccess ? 'success' : 'failure' });
    saveUserEmailMutation({ email: data.email, transactionId });
  });

  const FormButtonSection = () => {
    if (isSuccess) {
      return (
        <div className="flex items-center justify-center mt-2 text-white btn-success btn">Successfully saved!</div>
      );
    }

    if (isPending) {
      return <div className="flex items-center justify-center mt-2 text-white bg-blue-700 btn">Loading...</div>;
    }

    return (
      <>
        <div className="flex items-center justify-center mt-2">
          <div className="mr-3 grow">
            <TextInput type="email" placeholder="example@mail.com" register={register('email')} />
          </div>
          <button className="px-5 text-white bg-blue-700 btn rounded-xl" type="submit">
            Submit
          </button>
        </div>
        {isError && (
          <p className="mt-1 text-center text-red-600" id="request-error-message">
            Error while saving your email. Please try again.
          </p>
        )}
      </>
    );
  };

  return (
    <form className="w-full" onSubmit={onSubmit} aria-errormessage={isError ? 'request-error-message' : undefined}>
      <p className="text-center text-blue-700 font-bold">Thank you for using our new product!</p>
      <p className="font-light text-center text-blue-700">
        We’re always looking to improve, and we’d greatly appreciate your feedback. If you’re willing, please leave your
        email below so we can reach out for a quick chat about your experience.
      </p>
      <p className="font-light text-center text-blue-700">No newsletters, no spam — just your honest thoughts.</p>
      <FormButtonSection />
    </form>
  );
};
