import { useEffect, useRef } from "react";
import { Trans, useTranslation } from "react-i18next";

import { useFeeComparisonStore } from "../../../stores/feeComparison";
import { FeeComparisonTable } from "./FeeComparisonTable";

export const FeeComparison = () => {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const { setFeeComparisonRef } = useFeeComparisonStore();

  useEffect(() => {
    setFeeComparisonRef(ref);
  }, [setFeeComparisonRef]);

  return (
    <section
      className="bg-[radial-gradient(at_74%_98%,theme(colors.blue.900),theme(colors.blue.950),theme(colors.blue.950))] py-16 lg:py-32"
      ref={ref}
    >
      <div className="container mx-auto grid grid-cols-1 gap-x-20 gap-y-10 px-4 py-8 sm:px-8 lg:grid-cols-2 lg:gap-y-0">
        <div className="text-white ">
          <h2 className="text-h2">
            <Trans i18nKey="sections.feeComparison.title">
              <strong className="text-blue-400">Save</strong> on exchange rate markups
            </Trans>
          </h2>
          <p className="mt-4 text-body-lg">
            <Trans i18nKey="sections.feeComparison.description">
              The cost of your transfer comes from the fee and the exchange rate. Many providers offer
              <em className="font-bold text-blue-400">”no fee”</em>, while hiding a markup in the exchange rate, making you pay
              more.
            </Trans>
          </p>
          <p className="mt-4 text-body-lg">{t("sections.feeComparison.description2")}</p>
        </div>
        <FeeComparisonTable />
      </div>
    </section>
  );
};
