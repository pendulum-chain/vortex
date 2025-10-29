import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { useEventsContext } from "../../contexts/events";
import { EmailService } from "../../services/api";
import { TextInput } from "../TextInput";

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
    isError
  } = useMutation({
    mutationFn: async (data: { email: string; transactionId: string }) => {
      return EmailService.storeEmail(data.email, data.transactionId);
    }
  });

  const onSubmit = handleSubmit(data => {
    if (!transactionId) {
      console.error("Transaction ID is missing");
      return;
    }

    trackEvent({ event: "email_submission", transaction_status: transactionSuccess ? "success" : "failure" });
    saveUserEmailMutation({ email: data.email, transactionId });
  });

  const FormButtonSection = () => {
    if (isSuccess) {
      return (
        <div className="mt-2 flex items-center rounded bg-green-600 px-4 py-2 font-medium text-white md:px-8">
          {t("components.emailForm.success")}
        </div>
      );
    }

    if (isPending) {
      return (
        <div className="mt-2 flex items-center rounded bg-blue-600 px-4 py-2 font-medium text-white md:px-8">
          {t("components.emailForm.loading")}
        </div>
      );
    }

    return (
      <>
        <div className="mt-2 flex items-center">
          <div className="mr-3 grow">
            <TextInput placeholder="example@mail.com" register={register("email")} type="email" />
          </div>
          <button
            className="rounded bg-blue-600 px-5 py-2 font-medium text-white transition-colors hover:bg-blue-700"
            type="submit"
          >
            {t("components.emailForm.submit")}
          </button>
        </div>
        {isError && (
          <p className="mt-2 px-4 text-red-600 text-sm md:px-8" id="request-error-message">
            {t("components.emailForm.error")}
          </p>
        )}
      </>
    );
  };

  return (
    <form aria-errormessage={isError ? "request-error-message" : undefined} className="w-full" onSubmit={onSubmit}>
      <div className="mb-4">
        <p className="mb-2 font-bold text-gray-700">{t("components.emailForm.title")}</p>
        <p className="mb-1 font-light text-gray-700 leading-relaxed">{t("components.emailForm.description")}</p>
        <p className="font-light text-gray-700 text-sm leading-relaxed">{t("components.emailForm.noNewslettersNoSpam")}</p>
      </div>
      <FormButtonSection />
    </form>
  );
};
