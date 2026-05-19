import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { cn } from "../../helpers/cn";
import type { MykoboKycFiles, MykoboKycFormData } from "../../machines/mykoboKyc.machine";

interface MykoboKycFormProps {
  onSubmit: (formData: MykoboKycFormData, files: MykoboKycFiles) => void;
  onCancel: () => void;
}

type SourceOfFunds = MykoboKycFormData["sourceOfFunds"];
type IdType = MykoboKycFormData["idType"];

const SOURCE_OF_FUNDS_OPTIONS: SourceOfFunds[] = ["EMPLOYMENT", "SAVINGS", "LOANS", "INVESTMENT", "INHERITANCE"];
const ID_TYPE_OPTIONS: IdType[] = ["PASSPORT", "ID_CARD", "DRIVERS_LICENSE"];

export const MykoboKycForm = ({ onSubmit, onCancel }: MykoboKycFormProps) => {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<MykoboKycFormData>({
    defaultValues: {
      idType: "PASSPORT",
      sourceOfFunds: "EMPLOYMENT"
    }
  });

  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);
  const faceRef = useRef<HTMLInputElement>(null);
  const utilityRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const idType = watch("idType");
  const backRequired = idType === "ID_CARD" || idType === "DRIVERS_LICENSE";

  const submit = handleSubmit(values => {
    const front = frontRef.current?.files?.[0];
    const face = faceRef.current?.files?.[0];
    const utilityBill = utilityRef.current?.files?.[0];
    const back = backRef.current?.files?.[0];

    if (!front || !face || !utilityBill) {
      setFileError("Front of ID, selfie, and utility bill are required.");
      return;
    }
    if (backRequired && !back) {
      setFileError("Back of ID is required for ID cards and driver's licenses.");
      return;
    }
    setFileError(null);
    onSubmit(values, { back: backRequired ? back : undefined, face, front, utilityBill });
  });

  const inputClass = "w-full rounded-lg border border-base-300 bg-base-200 p-2 text-sm";
  const labelClass = "flex flex-col gap-1 text-sm";

  return (
    <form className="flex flex-col gap-4 p-4" onSubmit={submit}>
      <h2 className="text-h3">KYC verification</h2>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={labelClass}>
          First name
          <input className={inputClass} {...register("firstName", { required: true })} />
        </label>
        <label className={labelClass}>
          Last name
          <input className={inputClass} {...register("lastName", { required: true })} />
        </label>
        <label className={cn(labelClass, "md:col-span-2")}>
          Email address
          <input className={inputClass} type="email" {...register("emailAddress", { required: true })} />
        </label>
        <label className={cn(labelClass, "md:col-span-2")}>
          Address line 1
          <input className={inputClass} {...register("addressLine1", { required: true })} />
        </label>
        <label className={labelClass}>
          City
          <input className={inputClass} {...register("city", { required: true })} />
        </label>
        <label className={labelClass}>
          Country (ISO alpha-2)
          <input className={inputClass} maxLength={2} {...register("idCountryCode", { required: true })} />
        </label>
        <label className={cn(labelClass, "md:col-span-2")}>
          IBAN
          <input className={inputClass} {...register("bankAccountNumber", { required: true })} />
        </label>
        <label className={labelClass}>
          Tax country (ISO alpha-2)
          <input className={inputClass} maxLength={2} {...register("taxCountry", { required: true })} />
        </label>
        <label className={labelClass}>
          Source of funds
          <select className={inputClass} {...register("sourceOfFunds", { required: true })}>
            {SOURCE_OF_FUNDS_OPTIONS.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className={cn(labelClass, "md:col-span-2")}>
          ID type
          <select className={inputClass} {...register("idType", { required: true })}>
            {ID_TYPE_OPTIONS.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={labelClass}>
          Front of ID
          <input accept="image/*,application/pdf" ref={frontRef} type="file" />
        </label>
        {backRequired && (
          <label className={labelClass}>
            Back of ID
            <input accept="image/*,application/pdf" ref={backRef} type="file" />
          </label>
        )}
        <label className={labelClass}>
          Selfie
          <input accept="image/*" ref={faceRef} type="file" />
        </label>
        <label className={labelClass}>
          Utility bill
          <input accept="image/*,application/pdf" ref={utilityRef} type="file" />
        </label>
      </div>

      {fileError && <p className="text-red-700 text-sm">{fileError}</p>}
      {Object.keys(errors).length > 0 && <p className="text-red-700 text-sm">Please fill in all required fields.</p>}

      <div className="flex justify-end gap-2">
        <button className="btn btn-vortex-accent" onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="btn btn-vortex-primary" disabled={isSubmitting} type="submit">
          Submit
        </button>
      </div>
    </form>
  );
};
