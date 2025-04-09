import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { TextInput } from '../TextInput';
import { useEventsContext } from '../../contexts/events';
import { EmailService } from '../../services/api';

interface EmailFormProps {
  transactionId?: string;
  // Boolean to check if the transaction was successful, important for the event tracking
  transactionSuccess: boolean;
}

export const EmailForm = ({ transactionId, transactionSuccess }: EmailFormProps) => {
  const { t } = useTranslation();
  const { register, handleSubmit } = useForm();
  const { trackEvent } = useEventsContext();

  const {
    mutate: saveUserEmailMutation,
    isPending,
    isSuccess,
    isError,
  } = useMutation({
    mutationFn: async (data: { email: string; transactionId: string }) => {
      return EmailService.storeEmail(data.email, data.transactionId);
    }
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
        <div className="flex items-center justify-center mt-2 text-white btn-success btn">
          {t('components.emailForm.success')}
        </div>
      );
    }

    if (isPending) {
      return (
        <div className="flex items-center justify-center mt-2 btn-vortex-primary btn">
          {t('components.emailForm.loading')}
        </div>
      );
    }

    return (
      <>
        <div className="flex items-center justify-center mt-2">
          <div className="mr-3 grow">
            <TextInput type="email" placeholder="example@mail.com" register={register('email')} />
          </div>
          <button className="px-5 btn-vortex-primary btn rounded-xl" type="submit">
            {t('components.emailForm.submit')}
          </button>
        </div>
        {isError && (
          <p className="mt-1 text-center text-red-600" id="request-error-message">
            {t('components.emailForm.error')}
          </p>
        )}
      </>
    );
  };

  return (
    <form className="w-full" onSubmit={onSubmit} aria-errormessage={isError ? 'request-error-message' : undefined}>
      <p className="font-bold text-center text-blue-700">{t('components.emailForm.title')}</p>
      <p className="font-light text-center text-blue-700">{t('components.emailForm.description')}</p>
      <p className="font-light text-center text-blue-700">{t('components.emailForm.noNewslettersNoSpam')}</p>
      <FormButtonSection />
    </form>
  );
};
