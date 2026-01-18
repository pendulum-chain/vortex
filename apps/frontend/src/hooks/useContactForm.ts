import { yupResolver } from "@hookform/resolvers/yup";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as yup from "yup";

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const createContactFormSchema = (t: (key: string) => string) =>
  yup.object({
    email: yup
      .string()
      .required(t("pages.contact.validation.emailRequired"))
      .matches(EMAIL_REGEX, t("pages.contact.validation.emailFormat")),
    fullName: yup.string().required(t("pages.contact.validation.fullNameRequired")),
    inquiry: yup.string().required(t("pages.contact.validation.inquiryRequired")),
    privacyPolicyAccepted: yup
      .boolean()
      .oneOf([true], t("pages.contact.validation.privacyPolicyRequired"))
      .required(t("pages.contact.validation.privacyPolicyRequired")),
    projectName: yup.string().required(t("pages.contact.validation.projectNameRequired"))
  });

export type ContactFormData = yup.InferType<ReturnType<typeof createContactFormSchema>>;

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
    resolver: yupResolver(schema)
  });

  return { form, schema };
}
