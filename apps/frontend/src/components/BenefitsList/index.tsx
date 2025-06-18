import { CheckIcon } from "@heroicons/react/20/solid";
import { Trans, useTranslation } from "react-i18next";

export const BenefitsList = () => {
  const { t } = useTranslation();

  return (
    <ul>
      <li className="flex">
        <CheckIcon className="mr-2 w-4 text-pink-500" />
        <p>{t("components.benefitsList.noHiddenFees")}</p>
      </li>
      <li className="flex">
        <CheckIcon className="mr-2 w-4 text-pink-500" />
        <p>
          <Trans i18nKey="components.benefitsList.takes5Minutes">
            Takes <span className="font-bold text-blue-700">5 minutes</span>
          </Trans>
        </p>
      </li>
    </ul>
  );
};
