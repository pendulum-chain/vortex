import { isValidCnpj } from "@vortexfi/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRampActor } from "../../../contexts/rampState";
import { cn } from "../../../helpers/cn";
import { MenuButtons } from "../../MenuButtons";
import { StepFooter } from "../../StepFooter";

export interface KybTaxIdStepProps {
  className?: string;
}

export const KybTaxIdStep = ({ className }: KybTaxIdStepProps) => {
  const { t } = useTranslation();
  const rampActor = useRampActor();
  const [taxId, setTaxId] = useState("");
  const [localError, setLocalError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = taxId.trim();
    if (!isValidCnpj(trimmed)) {
      setLocalError(t("components.kybTaxIdStep.validation.invalidCnpj"));
      return;
    }

    setLocalError("");
    rampActor.send({ taxId: trimmed, type: "SUBMIT_KYB_TAX_ID" });
  };

  return (
    <div className={cn("relative flex min-h-(--widget-min-height) grow flex-col", className)}>
      <div className="flex items-center justify-between">
        <MenuButtons />
      </div>

      <form className="flex flex-1 flex-col pb-36" id="kyb-tax-id-form" onSubmit={handleSubmit}>
        <div className="mt-4 text-center">
          <h1 className="mb-4 font-bold text-primary text-widget-title">{t("components.kybTaxIdStep.title")}</h1>
          <p className="mb-6 text-gray-600">{t("components.kybTaxIdStep.description")}</p>
        </div>

        <div className="flex flex-col items-center">
          <div className="w-full max-w-md space-y-4">
            <div>
              <label className="mb-1 block" htmlFor="kyb-tax-id">
                {t("components.kybTaxIdStep.fields.cnpj.label")}
              </label>
              <input
                aria-describedby={localError ? "kyb-tax-id-error" : undefined}
                aria-invalid={!!localError}
                autoFocus
                className={cn(
                  "input-vortex-primary input-ghost w-full rounded-lg border-1 border-neutral-300 p-2",
                  localError && "border-red-800"
                )}
                id="kyb-tax-id"
                onChange={e => setTaxId(e.target.value)}
                placeholder={t("components.kybTaxIdStep.fields.cnpj.placeholder")}
                type="text"
                value={taxId}
              />
              {localError && (
                <span className="mt-1 block text-red-800 text-sm" id="kyb-tax-id-error">
                  {localError}
                </span>
              )}
            </div>
          </div>
        </div>
      </form>

      <StepFooter>
        <button className="btn-vortex-primary btn w-full" disabled={!taxId.trim()} form="kyb-tax-id-form" type="submit">
          {t("components.kybTaxIdStep.continue")}
        </button>
      </StepFooter>
    </div>
  );
};
