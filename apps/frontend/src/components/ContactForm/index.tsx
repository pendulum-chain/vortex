import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../helpers/cn";
import { useContactForm } from "../../hooks/useContactForm";
import { submitContactForm } from "../../services/api/contact.service";
import { Field } from "../Field";
import { HoldButton } from "../HoldButton";
import { TextArea } from "../TextArea";

type ButtonState = "idle" | "loading" | "success" | "error";

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

  const [buttonState, setButtonState] = useState<ButtonState>("idle");

  const { mutate, isPending } = useMutation({
    mutationFn: submitContactForm,
    onError: () => {
      setButtonState("error");
    },
    onSuccess: () => {
      reset();
      setButtonState("success");
    }
  });

  useEffect(() => {
    if (buttonState === "success" || buttonState === "error") {
      const timeout = setTimeout(() => setButtonState("idle"), 3000);
      return () => clearTimeout(timeout);
    }
  }, [buttonState]);

  useEffect(() => {
    if (isPending || isSubmitting) {
      setButtonState("loading");
    }
  }, [isPending, isSubmitting]);

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

  const buttonCopy: Record<ButtonState, string> = {
    error: t("pages.contact.error"),
    idle: t("pages.contact.form.holdToSubmit"),
    loading: "Sending…",
    success: t("pages.contact.success")
  };

  const getButtonClassName = () => {
    if (buttonState === "success") return "bg-green-500 text-white";
    if (buttonState === "error") return "bg-red-300 text-red-800";
    if (loading) return "bg-primary text-white";
    return "";
  };

  return (
    <form className="space-y-2" onKeyDown={handleKeyDown} onSubmit={e => e.preventDefault()} ref={formRef}>
      <FormField
        error={touchedFields.fullName ? errors.fullName?.message : undefined}
        htmlFor={`${formId}-fullName`}
        label={t("pages.contact.form.fullName")}
      >
        <Field
          autoComplete="name"
          disabled={loading}
          error={touchedFields.fullName && !!errors.fullName}
          id={`${formId}-fullName`}
          placeholder={t("pages.contact.form.fullNamePlaceholder")}
          register={register("fullName")}
          spellCheck={false}
        />
      </FormField>

      <FormField
        error={touchedFields.email ? errors.email?.message : undefined}
        htmlFor={`${formId}-email`}
        label={t("pages.contact.form.email")}
      >
        <Field
          autoComplete="email"
          disabled={loading}
          error={touchedFields.email && !!errors.email}
          id={`${formId}-email`}
          placeholder={t("pages.contact.form.emailPlaceholder")}
          register={register("email")}
          type="email"
        />
      </FormField>

      <FormField
        error={touchedFields.projectName ? errors.projectName?.message : undefined}
        htmlFor={`${formId}-projectName`}
        label={t("pages.contact.form.projectName")}
      >
        <Field
          autoComplete="organization"
          disabled={loading}
          error={touchedFields.projectName && !!errors.projectName}
          id={`${formId}-projectName`}
          placeholder={t("pages.contact.form.projectNamePlaceholder")}
          register={register("projectName")}
          spellCheck={false}
        />
      </FormField>

      <FormField
        error={touchedFields.inquiry ? errors.inquiry?.message : undefined}
        htmlFor={`${formId}-inquiry`}
        label={t("pages.contact.form.inquiry")}
      >
        <TextArea
          disabled={loading}
          error={touchedFields.inquiry && !!errors.inquiry}
          id={`${formId}-inquiry`}
          placeholder={t("pages.contact.form.inquiryPlaceholder")}
          register={register("inquiry")}
          rows={4}
        />
      </FormField>

      <div className="flex items-start gap-2 pt-1">
        <input
          {...register("privacyPolicyAccepted")}
          className="checkbox checkbox-primary checkbox-sm mt-0.5"
          disabled={loading}
          id={`${formId}-privacy`}
          type="checkbox"
        />
        <label className="text-gray-500 text-sm" htmlFor={`${formId}-privacy`}>
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
          className={cn("touch-manipulation", getButtonClassName())}
          disabled={loading || !isValid || buttonState === "success"}
          error={buttonState === "error"}
          holdClassName="bg-primary text-white"
          onComplete={onSubmit}
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center gap-2"
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 25 }}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -25 }}
              key={buttonState}
              transition={{ bounce: 0, duration: 0.3, type: "spring" }}
            >
              {buttonState === "loading" && (
                <svg aria-hidden="true" className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    fill="currentColor"
                  />
                </svg>
              )}
              {buttonState === "success" && (
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  viewBox="0 0 24 24"
                >
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {buttonState === "error" && (
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  viewBox="0 0 24 24"
                >
                  <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {buttonCopy[buttonState]}
            </motion.span>
          </AnimatePresence>
        </HoldButton>
      </div>
    </form>
  );
}

interface FormFieldProps {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  error?: string;
}

const EASE_OUT = [0.25, 0.46, 0.45, 0.94] as const;

function FormField({ label, htmlFor, children, error }: FormFieldProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div>
      <label className="mb-1 block font-medium text-gray-600 text-xs" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      <AnimatePresence>
        {error && (
          <motion.p
            animate={{ height: "auto", opacity: 1 }}
            className="mt-1 overflow-hidden text-red-600 text-xs"
            exit={{ height: 0, opacity: 0 }}
            initial={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: EASE_OUT }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
