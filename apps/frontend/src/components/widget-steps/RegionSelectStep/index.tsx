import { getAnyFiatTokenDetails } from "@vortexfi/shared";
import { useSelector } from "@xstate/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { isFiatTokenEnabled } from "../../../config/tokenAvailability";
import { KYB_REGIONS, KybRegion } from "../../../constants/kybRegions";
import { useRampActor } from "../../../contexts/rampState";
import { cn } from "../../../helpers/cn";
import { FiatIcon } from "../../FiatIcon";
import { MenuButtons } from "../../MenuButtons";
import { StepFooter } from "../../StepFooter";
import { DropdownSelector } from "../../ui/DropdownSelector";

export interface RegionSelectStepProps {
  className?: string;
}

const availableRegions = KYB_REGIONS.filter(region => isFiatTokenEnabled(region.fiatToken));

const RegionOption = ({ region }: { region: KybRegion }) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3">
      <FiatIcon className="h-6 w-6" fiat={getAnyFiatTokenDetails(region.fiatToken)} />
      <span className="font-medium">{t(region.labelKey)}</span>
    </div>
  );
};

export const RegionSelectStep = ({ className }: RegionSelectStepProps) => {
  const { t } = useTranslation();
  const rampActor = useRampActor();
  const presetFiatToken = useSelector(rampActor, state => state.context.kybLink?.fiatToken);

  const presetRegion = availableRegions.find(region => region.fiatToken === presetFiatToken);
  const [selected, setSelected] = useState<KybRegion | undefined>(presetRegion);
  const [open, setOpen] = useState(false);

  const handleContinue = () => {
    if (!selected) return;
    rampActor.send({ fiatToken: selected.fiatToken, type: "SELECT_REGION" });
  };

  return (
    <div className={cn("relative flex min-h-(--widget-min-height) grow flex-col", className)}>
      <div className="flex items-center justify-between">
        <MenuButtons />
      </div>

      <div className="flex flex-1 flex-col pb-36">
        <div className="mt-4 text-center">
          <h1 className="mb-4 font-bold text-primary text-widget-title">{t("components.regionSelectStep.title")}</h1>
          <p className="mb-6 text-gray-600">{t("components.regionSelectStep.description")}</p>
        </div>

        <DropdownSelector
          label={t("components.regionSelectStep.label")}
          onOpenChange={setOpen}
          open={open}
          triggerAriaLabel={t("components.regionSelectStep.label")}
          triggerContent={
            selected ? (
              <RegionOption region={selected} />
            ) : (
              <span className="text-secondary-content">{t("components.regionSelectStep.placeholder")}</span>
            )
          }
        >
          {availableRegions.map(region => (
            <button
              aria-selected={selected?.code === region.code}
              className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors [@media(hover:hover)]:hover:bg-neutral"
              key={region.code}
              onClick={() => {
                setSelected(region);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              <RegionOption region={region} />
            </button>
          ))}
        </DropdownSelector>
      </div>

      <StepFooter>
        <button className="btn-vortex-primary btn w-full" disabled={!selected} onClick={handleContinue} type="button">
          {t("components.regionSelectStep.continue")}
        </button>
      </StepFooter>
    </div>
  );
};
