import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { storeUserEmailInBackend } from '../../services/storage/storeUserEmailInBackend';
import { TextInput } from '../../components/TextInput';

export const EmailForm = () => {
  const { register, handleSubmit } = useForm();

  const {
    mutate: saveUserEmailMutation,
    isPending,
    isSuccess,
    isError,
  } = useMutation({
    mutationFn: storeUserEmailInBackend,
  });

  const onSubmit = handleSubmit((data) => {
    saveUserEmailMutation({ email: data.email });
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
      <p className="font-light text-center text-blue-700">
        To receive further assistance and information about our app,
      </p>
      <p className="font-light text-center text-blue-700">please provide your email address below:</p>
      <FormButtonSection />
    </form>
  );
};
