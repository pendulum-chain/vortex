import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const createContactFormSchema = (t: (key: string) => string) =>
  z.object({
    email: z
      .string()
      .min(1, t("pages.contact.validation.emailRequired"))
      .regex(EMAIL_REGEX, t("pages.contact.validation.emailFormat")),
    fullName: z.string().min(1, t("pages.contact.validation.fullNameRequired")),
    inquiry: z.string().min(1, t("pages.contact.validation.inquiryRequired")),
    privacyPolicyAccepted: z
      .boolean()
      .refine(val => val === true, { message: t("pages.contact.validation.privacyPolicyRequired") }),
    projectName: z.string().min(1, t("pages.contact.validation.projectNameRequired"))
  });

export type ContactFormData = z.infer<ReturnType<typeof createContactFormSchema>>;

export function useContactForm() {
  const { t } = useTranslation();
  const schema = createContactFormSchema(t);

  const form = useForm<ContactFormData>({
    defaultValues: {
      email: "",
      fullName: "",
      inquiry: "",
      privacyPolicyAccepted: false,
      projectName: ""
    },
    mode: "onChange",
    resolver: standardSchemaResolver(schema)
  });

  return { form, schema };
}
