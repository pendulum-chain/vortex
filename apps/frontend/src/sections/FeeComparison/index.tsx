import { Trans, useTranslation } from 'react-i18next';

import { FeeComparisonTable } from './FeeComparisonTable';

import { useEffect, useRef } from 'react';
import { RampDirection } from '../../components/RampToggle';
import { useFeeComparisonStore } from '../../stores/feeComparison';
import { useRampDirection } from '../../stores/rampDirectionStore';

export const FeeComparison = () => {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const { setFeeComparisonRef } = useFeeComparisonStore();
  const rampDirecton = useRampDirection();

  useEffect(() => {
    setFeeComparisonRef(ref);
  }, [setFeeComparisonRef]);

  if (rampDirecton === RampDirection.ONRAMP) {
    // We don't want to show the fee comparison section on the onramp page for now
    return (
      <section
        ref={ref}
        className="py-4 mt-10 mb-24 bg-[radial-gradient(at_74%_98%,theme(colors.blue.900),theme(colors.blue.950),theme(colors.blue.950))]"
      />
    );
  }

  return (
    <section
      ref={ref}
      className="py-24 mt-10 mb-24 bg-[radial-gradient(at_74%_98%,theme(colors.blue.900),theme(colors.blue.950),theme(colors.blue.950))]"
    >
      <div className="container grid md:grid-cols-2 grid-cols-1 px-4 py-8 gap-x-20 mx-auto">
        <div className="text-white">
          <h1 className="text-4xl">
            <Trans i18nKey="sections.feeComparison.title">
              <strong className="text-blue-400">Save</strong> on exchange rate markups
            </Trans>
          </h1>
          <p className="mt-4 text-lg">
            <Trans i18nKey="sections.feeComparison.description">
              The cost of your transfer comes from the fee and the exchange rate. Many providers offer
              <em className="font-bold text-blue-400">”no fee”</em>, while hiding a markup in the exchange rate, making
              you pay more.
            </Trans>
          </p>
          <p className="mt-4 text-lg">{t('sections.feeComparison.description2')}</p>
        </div>
        <FeeComparisonTable />
      </div>
    </section>
  );
};
