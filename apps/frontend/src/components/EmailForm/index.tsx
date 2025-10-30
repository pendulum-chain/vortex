import { useMutation } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useEventsContext } from "../../contexts/events";
import { cn } from "../../helpers/cn";
import { EmailService } from "../../services/api";
import { LoadingProgressBar } from "../LoadingProgressBar";
import { Spinner } from "../Spinner";
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
    return (
      <>
        <div className="mt-2 flex items-center">
          <div className={cn("grow", !isPending && !isSuccess && "mr-3")}>
            <AnimatePresence mode="wait">
              {isPending || isSuccess ? (
                <LoadingProgressBar isSuccess={isSuccess} key="loading" successMessage={t("components.emailForm.success")} />
              ) : (
                <TextInput additionalStyle="h-12!" placeholder="example@mail.com" register={register("email")} type="email" />
              )}
            </AnimatePresence>
          </div>
          {!isPending && !isSuccess && (
            <button
              className="h-12! min-w-24 cursor-pointer rounded bg-blue-600 px-5 py-2 text-center font-medium text-white transition-all duration-200 hover:bg-blue-700 active:scale-95"
              disabled={isPending}
              type="submit"
            >
              {isPending ? <Spinner /> : t("components.emailForm.submit")}
            </button>
          )}
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
