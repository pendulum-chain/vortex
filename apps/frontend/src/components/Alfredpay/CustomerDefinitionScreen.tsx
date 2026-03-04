import { memo } from "react";
import { Trans, useTranslation } from "react-i18next";
import businessHandshake from "../../assets/business-handshake.svg";
import livenessCheck from "../../assets/liveness-check.svg";
import { MenuButtons } from "../MenuButtons";
import { StepFooter } from "../StepFooter";

interface CustomerDefinitionScreenProps {
  kycOrKyb: string;
  isBusiness: boolean;
  onAccept: () => void;
  onToggleBusiness: () => void;
}

const toggleLinkClass =
  "cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-blue-600 underline touch-manipulation [@media(hover:hover)]:hover:text-blue-800";

export const CustomerDefinitionScreen = memo(
  ({ kycOrKyb, isBusiness, onAccept, onToggleBusiness }: CustomerDefinitionScreenProps) => {
    const { t } = useTranslation();

    return (
      <div className="relative flex grow-1 flex-col items-center">
        <MenuButtons />
        {isBusiness ? (
          <img alt="Business Handshake" className="mx-auto mt-8 mb-8 h-50 w-1/2 object-contain" src={businessHandshake} />
        ) : (
          <img alt="Liveness Check" className="mx-auto mt-8 mb-8 h-50 w-1/2 object-contain" src={livenessCheck} />
        )}

        <p className="text-balance text-center text-gray-600">
          {t("components.alfredpayKycFlow.continueWithPartner", { kycOrKyb })}
        </p>

        <p className="text-balance text-center text-gray-500 text-sm">
          <Trans
            components={{
              1: <button className={toggleLinkClass} onClick={onToggleBusiness} type="button" />
            }}
            i18nKey={
              isBusiness ? "components.alfredpayKycFlow.registerAsIndividual" : "components.alfredpayKycFlow.registerAsBusiness"
            }
          />
        </p>

        <StepFooter>
          <button className="btn-vortex-primary btn w-full touch-manipulation rounded-xl" onClick={onAccept} type="button">
            {t("components.alfredpayKycFlow.continue")}
          </button>
        </StepFooter>
      </div>
    );
  }
);

CustomerDefinitionScreen.displayName = "CustomerDefinitionScreen";
