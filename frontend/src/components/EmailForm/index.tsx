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
    },
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
        <div className="flex items-center px-4 md:px-8 mt-2 py-2 bg-green-600 text-white font-medium rounded">
          {t('components.emailForm.success')}
        </div>
      );
    }

    if (isPending) {
      return (
        <div className="flex items-center px-4 md:px-8 mt-2 py-2 bg-blue-600 text-white font-medium rounded">
          {t('components.emailForm.loading')}
        </div>
      );
    }

    return (
      <>
        <div className="flex items-center mt-2">
          <div className="mr-3 grow">
            <TextInput type="email" placeholder="example@mail.com" register={register('email')} />
          </div>
          <button
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition-colors"
            type="submit"
          >
            {t('components.emailForm.submit')}
          </button>
        </div>
        {isError && (
          <p className="mt-2 px-4 md:px-8 text-red-600 text-sm" id="request-error-message">
            {t('components.emailForm.error')}
          </p>
        )}
      </>
    );
  };

  return (
    <form className="w-full" onSubmit={onSubmit} aria-errormessage={isError ? 'request-error-message' : undefined}>
      <div className="mb-4">
        <p className="font-bold text-gray-700 mb-2">{t('components.emailForm.title')}</p>{' '}
        {/* Changed text-blue-700 to text-gray-700 */}
        <p className="font-light text-gray-700 leading-relaxed mb-1">{t('components.emailForm.description')}</p>{' '}
        {/* Changed text-blue-700 to text-gray-700 */}
        <p className="font-light text-gray-700 leading-relaxed text-sm">
          {t('components.emailForm.noNewslettersNoSpam')}
        </p>{' '}
        {/* Changed text-blue-700 to text-gray-700 */}
      </div>
      <FormButtonSection />
    </form>
  );
};
