import { zodResolver } from "@hookform/resolvers/zod";
import {
  type DefaultValues,
  type FieldValues,
  type Path,
  type Resolver,
  type SubmitHandler,
  type UseFormReturn,
  useForm
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { ZodType } from "zod";
import { MenuButtons } from "../MenuButtons";

/**
 * Renders one country-specific Alfredpay KYC form.
 *
 * Each country (MX, CO, AR) shares the same outer layout — title/subtitle, a vertical
 * stack of labelled inputs, and a submit button — but differs in:
 *   - its Zod schema (validation rules and accepted document types)
 *   - the exact list and order of fields
 *   - the namespace under which its i18n strings live
 */

type KycFormFieldGroup<TValues extends FieldValues> = {
  type: "group";
  fields: KycLeafField<TValues>[];
};

type KycLeafField<TValues extends FieldValues> = KycTextField<TValues> | KycCheckboxField<TValues> | KycCustomField<TValues>;

interface KycTextField<TValues extends FieldValues> {
  type: "text";
  name: Path<TValues>;
  labelKey: string;
  placeholderKey?: string;
  placeholder?: string;
  inputType?: "text" | "email" | "tel" | "date";
  inputMode?: "text" | "email" | "tel" | "numeric";
  autoComplete?: string;
}

interface KycCheckboxField<TValues extends FieldValues> {
  type: "checkbox";
  name: Path<TValues>;
  labelKey: string;
}

interface KycCustomField<TValues extends FieldValues> {
  type: "custom";
  name: Path<TValues>;
  labelKey: string;
  render: (form: UseFormReturn<TValues>) => React.ReactNode;
}

type KycFormField<TValues extends FieldValues> = KycLeafField<TValues> | KycFormFieldGroup<TValues>;

export interface KycFormConfig<TValues extends FieldValues> {
  i18nNamespace: string;
  idPrefix: string;
  schema: ZodType<TValues>;
  defaultValues?: DefaultValues<TValues>;
  fields: KycFormField<TValues>[];
}

interface KycFormScreenProps<TValues extends FieldValues> {
  config: KycFormConfig<TValues>;
  onSubmit: (data: TValues) => void;
}

const inputClass = (hasError: boolean) =>
  `input-vortex-primary input-ghost w-full rounded-lg border p-2 text-base ${hasError ? "border-error" : "border-neutral-300"}`;

export function KycFormScreen<TValues extends FieldValues>({ config, onSubmit }: KycFormScreenProps<TValues>) {
  const { t } = useTranslation();

  const form = useForm<TValues>({
    defaultValues: config.defaultValues,
    resolver: zodResolver(config.schema) as Resolver<TValues>
  });
  const {
    formState: { errors },
    handleSubmit
  } = form;

  const renderSingleField = (field: KycLeafField<TValues>) => {
    const id = `${config.idPrefix}-${field.name}`;
    const errorMessage = (errors as Record<string, { message?: string } | undefined>)[field.name as string]?.message;

    if (field.type === "checkbox") {
      return (
        <div key={field.name as string}>
          <div className="flex items-center gap-2">
            <input className="checkbox checkbox-primary" id={id} type="checkbox" {...form.register(field.name)} />
            <label className="text-sm" htmlFor={id}>
              {t(field.labelKey)}
            </label>
          </div>
          {errorMessage && <span className="block text-error text-xs">{errorMessage}</span>}
        </div>
      );
    }

    if (field.type === "custom") {
      return (
        <div key={field.name as string}>
          <label className="mb-1 block text-sm" htmlFor={id}>
            {t(field.labelKey)}
          </label>
          {field.render(form)}
          {errorMessage && <span className="mt-1 block text-error text-xs">{errorMessage}</span>}
        </div>
      );
    }

    const placeholder = field.placeholderKey ? t(field.placeholderKey) : field.placeholder;
    return (
      <div key={field.name as string}>
        <label className="mb-1 block text-sm" htmlFor={id}>
          {t(field.labelKey)}
        </label>
        <input
          autoComplete={field.autoComplete}
          className={inputClass(!!errorMessage)}
          id={id}
          inputMode={field.inputMode}
          placeholder={placeholder}
          type={field.inputType ?? "text"}
          {...form.register(field.name)}
        />
        {errorMessage && <span className="mt-1 block text-error text-xs">{errorMessage}</span>}
      </div>
    );
  };

  return (
    <div className="flex grow-1 flex-col">
      <MenuButtons />
      <h1 className="mt-4 mb-2 text-center font-bold text-2xl text-primary">{t(`${config.i18nNamespace}.title`)}</h1>
      <p className="mb-4 text-center text-gray-500 text-sm">{t(`${config.i18nNamespace}.subtitle`)}</p>

      <form
        className="flex grow-1 flex-col space-y-3 overflow-y-auto px-1 pb-4"
        onSubmit={handleSubmit(onSubmit as SubmitHandler<TValues>)}
      >
        {config.fields.map((field, index) => {
          if (field.type === "group") {
            return (
              <div className="grid grid-cols-2 gap-3" key={`group-${index}`}>
                {field.fields.map(renderSingleField)}
              </div>
            );
          }
          return renderSingleField(field);
        })}

        <button className="btn btn-vortex-primary mt-2 w-full" type="submit">
          {t(`${config.i18nNamespace}.continue`)}
        </button>
      </form>
    </div>
  );
}

export { inputClass as kycInputClass };
