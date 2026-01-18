import { useMutation } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { cn } from "../../helpers/cn";
import { useContactForm } from "../../hooks/useContactForm";
import { submitContactForm } from "../../services/api/contact.service";
import { Field } from "../Field";
import { HoldButton } from "../HoldButton";
import { TextArea } from "../TextArea";

export function ContactForm() {
  const { t, i18n } = useTranslation();
  const { form } = useContactForm();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting, isValid },
    reset
  } = form;

  const { mutate, isPending, isSuccess, isError } = useMutation({
    mutationFn: submitContactForm,
    onSuccess: () => {
      reset();
    }
  });

  const onSubmit = handleSubmit(data => {
    mutate({
      email: data.email,
      fullName: data.fullName,
      inquiry: data.inquiry,
      projectName: data.projectName,
      timestamp: new Date().toISOString()
    });
  });

  const loading = isPending || isSubmitting;

  return (
    <form className="space-y-2" onSubmit={e => e.preventDefault()}>
      <FormField label={t("pages.contact.form.fullName")}>
        <Field disabled={loading} placeholder={t("pages.contact.form.fullNamePlaceholder")} register={register("fullName")} />
      </FormField>

      <FormField label={t("pages.contact.form.email")}>
        <Field
          disabled={loading}
          placeholder={t("pages.contact.form.emailPlaceholder")}
          register={register("email")}
          type="email"
        />
      </FormField>

      <FormField label={t("pages.contact.form.projectName")}>
        <Field
          disabled={loading}
          placeholder={t("pages.contact.form.projectNamePlaceholder")}
          register={register("projectName")}
        />
      </FormField>

      <FormField label={t("pages.contact.form.inquiry")}>
        <TextArea
          disabled={loading}
          placeholder={t("pages.contact.form.inquiryPlaceholder")}
          register={register("inquiry")}
          rows={4}
        />
      </FormField>

      <div className="flex items-start gap-2 pt-1">
        <input
          type="checkbox"
          {...register("privacyPolicyAccepted")}
          className="checkbox checkbox-primary checkbox-sm mt-0.5"
          disabled={loading}
        />
        <label className="text-gray-500 text-sm">
          {t("pages.contact.form.privacyPolicy")}{" "}
          <a
            className="text-blue-600 underline hover:text-blue-800"
            href={`/${i18n.language}/privacy-policy`}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("pages.contact.form.privacyPolicyLink")}
          </a>
        </label>
      </div>

      <div className="border-gray-200 border-b pt-2 pb-4">
        <HoldButton
          className={cn(loading && "bg-primary text-white")}
          disabled={loading || !isValid}
          holdClassName="bg-primary text-white"
          onComplete={onSubmit}
        >
          {loading ? <span className="loading loading-spinner loading-sm" /> : t("pages.contact.form.holdToSubmit")}
        </HoldButton>
      </div>

      {isSuccess && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="rounded-md bg-green-50 p-3 text-center text-green-800 text-sm"
          initial={{ opacity: 0, y: -10 }}
        >
          {t("pages.contact.success")}
        </motion.div>
      )}

      {isError && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="rounded-md bg-red-50 p-3 text-center text-red-800 text-sm"
          initial={{ opacity: 0, y: -10 }}
        >
          {t("pages.contact.error")}
        </motion.div>
      )}
    </form>
  );
}

interface FormFieldProps {
  label: string;
  children: React.ReactNode;
}

function FormField({ label, children }: FormFieldProps) {
  return (
    <div>
      <label className="mb-1 block font-medium text-gray-600 text-xs">{label}</label>
      {children}
    </div>
  );
}
