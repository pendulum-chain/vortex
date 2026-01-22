import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../helpers/cn";
import { useContactForm } from "../../hooks/useContactForm";
import { submitContactForm } from "../../services/api/contact.service";
import { HoldButton } from "../HoldButton";

const EASE_OUT = [0.25, 0.46, 0.45, 0.94] as const;

export function ContactForm() {
  const { t, i18n } = useTranslation();
  const { form } = useContactForm();
  const formRef = useRef<HTMLFormElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const {
    register,
    handleSubmit,
    formState: { isSubmitting, isValid, errors, touchedFields },
    reset
  } = form;

  const [showSuccess, setShowSuccess] = useState(false);

  const { mutate, isPending, isError } = useMutation({
    mutationFn: submitContactForm,
    onSuccess: () => {
      reset();
      setShowSuccess(true);
    }
  });

  useEffect(() => {
    if (!showSuccess) return;
    const timeout = setTimeout(() => setShowSuccess(false), 5000);
    return () => clearTimeout(timeout);
  }, [showSuccess]);

  const onSubmit = handleSubmit(data => {
    mutate({
      email: data.email,
      fullName: data.fullName,
      inquiry: data.inquiry,
      projectName: data.projectName,
      timestamp: new Date().toISOString()
    });
  });

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (isValid && !isPending && !isSubmitting) {
          onSubmit();
        }
      }
    },
    [isValid, isPending, isSubmitting, onSubmit]
  );

  const loading = isPending || isSubmitting;

  const formId = useId();

  return (
    <form className="space-y-4" onKeyDown={handleKeyDown} onSubmit={e => e.preventDefault()} ref={formRef}>
      <FormField
        error={touchedFields.fullName ? errors.fullName?.message : undefined}
        htmlFor={`${formId}-fullName`}
        label={t("pages.contact.form.fullName")}
      >
        <input
          {...register("fullName")}
          autoComplete="name"
          className={cn(
            "w-full rounded-lg border bg-white px-3 py-2.5 text-base text-gray-900 outline-none",
            "transition-[border-color,box-shadow] duration-150 ease-out",
            "placeholder:text-gray-400",
            "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
            "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500",
            touchedFields.fullName && errors.fullName ? "border-red-500" : "border-gray-200"
          )}
          disabled={loading}
          id={`${formId}-fullName`}
          placeholder={t("pages.contact.form.fullNamePlaceholder")}
          spellCheck={false}
        />
      </FormField>

      <FormField
        error={touchedFields.email ? errors.email?.message : undefined}
        htmlFor={`${formId}-email`}
        label={t("pages.contact.form.email")}
      >
        <input
          {...register("email")}
          autoComplete="email"
          className={cn(
            "w-full rounded-lg border bg-white px-3 py-2.5 text-base text-gray-900 outline-none",
            "transition-[border-color,box-shadow] duration-150 ease-out",
            "placeholder:text-gray-400",
            "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
            "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500",
            touchedFields.email && errors.email ? "border-red-500" : "border-gray-200"
          )}
          disabled={loading}
          id={`${formId}-email`}
          placeholder={t("pages.contact.form.emailPlaceholder")}
          type="email"
        />
      </FormField>

      <FormField
        error={touchedFields.projectName ? errors.projectName?.message : undefined}
        htmlFor={`${formId}-projectName`}
        label={t("pages.contact.form.projectName")}
      >
        <input
          {...register("projectName")}
          autoComplete="organization"
          className={cn(
            "w-full rounded-lg border bg-white px-3 py-2.5 text-base text-gray-900 outline-none",
            "transition-[border-color,box-shadow] duration-150 ease-out",
            "placeholder:text-gray-400",
            "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
            "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500",
            touchedFields.projectName && errors.projectName ? "border-red-500" : "border-gray-200"
          )}
          disabled={loading}
          id={`${formId}-projectName`}
          placeholder={t("pages.contact.form.projectNamePlaceholder")}
          spellCheck={false}
        />
      </FormField>

      <FormField
        error={touchedFields.inquiry ? errors.inquiry?.message : undefined}
        htmlFor={`${formId}-inquiry`}
        label={t("pages.contact.form.inquiry")}
      >
        <textarea
          {...register("inquiry")}
          className={cn(
            "w-full resize-none rounded-lg border bg-white px-3 py-2.5 text-base text-gray-900 outline-none",
            "transition-[border-color,box-shadow] duration-150 ease-out",
            "placeholder:text-gray-400",
            "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
            "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500",
            touchedFields.inquiry && errors.inquiry ? "border-red-500" : "border-gray-200"
          )}
          disabled={loading}
          id={`${formId}-inquiry`}
          placeholder={t("pages.contact.form.inquiryPlaceholder")}
          rows={4}
        />
      </FormField>

      <label className="flex cursor-pointer select-none items-start gap-3 py-1">
        <span className="relative mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center">
          <input
            {...register("privacyPolicyAccepted")}
            className="peer sr-only"
            disabled={loading}
            id={`${formId}-privacy`}
            type="checkbox"
          />
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded border-2 transition-colors duration-150 ease-out",
              "peer-checked:border-blue-600 peer-checked:bg-blue-600",
              "peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/20 peer-focus-visible:ring-offset-1",
              "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
              touchedFields.privacyPolicyAccepted && errors.privacyPolicyAccepted ? "border-red-500" : "border-gray-300"
            )}
          >
            <svg
              aria-hidden="true"
              className="h-3 w-3 text-white opacity-0 transition-opacity duration-100 peer-checked:opacity-100"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              viewBox="0 0 24 24"
            >
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </span>
        <span className="text-gray-600 text-sm leading-tight">
          {t("pages.contact.form.privacyPolicy")}{" "}
          <a
            className="text-blue-600 underline decoration-blue-600/30 underline-offset-2 transition-colors duration-150 ease-out hover:text-blue-700 hover:decoration-blue-700/50"
            href={`/${i18n.language}/privacy-policy`}
            onClick={e => e.stopPropagation()}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("pages.contact.form.privacyPolicyLink")}
          </a>
        </span>
      </label>

      <div className="pt-2">
        <HoldButton
          className={cn("touch-manipulation", loading && "bg-primary text-white")}
          disabled={loading || !isValid}
          holdClassName="bg-primary text-white"
          onComplete={onSubmit}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg aria-hidden="true" className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  fill="currentColor"
                />
              </svg>
              <span>Sending...</span>
            </span>
          ) : (
            t("pages.contact.form.holdToSubmit")
          )}
        </HoldButton>
      </div>

      <AnimatePresence mode="wait">
        {showSuccess && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded-lg bg-green-50 p-3 text-green-800 text-sm shadow-[0_0_0_1px_rgba(34,197,94,0.2)]"
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            role="status"
            transition={{ duration: 0.2, ease: EASE_OUT }}
          >
            <svg
              aria-hidden="true"
              className="h-5 w-5 flex-shrink-0 text-green-600"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t("pages.contact.success")}</span>
          </motion.div>
        )}

        {isError && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded-lg bg-red-50 p-3 text-red-800 text-sm shadow-[0_0_0_1px_rgba(239,68,68,0.2)]"
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            role="alert"
            transition={{ duration: 0.2, ease: EASE_OUT }}
          >
            <svg
              aria-hidden="true"
              className="h-5 w-5 flex-shrink-0 text-red-600"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t("pages.contact.error")}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}

interface FormFieldProps {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  error?: string;
}

function FormField({ label, htmlFor, children, error }: FormFieldProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div>
      <label className="mb-1.5 block font-medium text-gray-700 text-sm" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      <AnimatePresence>
        {error && (
          <motion.p
            animate={{ height: "auto", opacity: 1 }}
            className="mt-1 text-red-600 text-xs"
            exit={{ height: 0, opacity: 0 }}
            initial={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            role="alert"
            transition={{ duration: 0.15, ease: EASE_OUT }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
