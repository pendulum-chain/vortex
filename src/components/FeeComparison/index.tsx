import Big from 'big.js';
import { type FC } from 'react';

import { Networks } from '../../helpers/networks';
import { FeeComparisonTable } from './FeeComparisonTable';

export interface BaseComparisonProps {
  amount: Big;
  sourceAssetSymbol: string;
  targetAssetSymbol: string;
  vortexPrice: Big;
  network: Networks;
  trackPrice: boolean;
  children?: React.ReactNode;
  ref?: React.RefObject<HTMLDivElement | null>;
}

export const FeeComparison: FC<BaseComparisonProps> = ({
  ref,
  amount,
  sourceAssetSymbol,
  targetAssetSymbol,
  vortexPrice,
  network,
  trackPrice,
}) => (
  <section
    ref={ref}
    className="py-24 mt-10 mb-24 bg-[radial-gradient(at_74%_98%,theme(colors.blue.900),theme(colors.blue.950),theme(colors.blue.950))]"
  >
    <div className="container grid md:grid-cols-2 grid-cols-1 px-4 py-8 gap-x-20 mx-auto">
      <div className="text-white">
        <h1 className="text-4xl">
          <strong className="text-blue-400">Save</strong> on exchange rate markups
        </h1>
        <p className="mt-4 text-lg">
          The cost of your transfer comes from the fee and the exchange rate. Many providers offer{' '}
          <em className="font-bold text-blue-400">“no fee”</em>, while hiding a markup in the exchange rate, making you
          pay more.
        </p>
        <p className="mt-4 text-lg">At Vortex, we’ll never do that and show our fees upfront.</p>
      </div>
      <FeeComparisonTable
        amount={amount}
        sourceAssetSymbol={sourceAssetSymbol}
        targetAssetSymbol={targetAssetSymbol}
        vortexPrice={vortexPrice}
        network={network}
        trackPrice={trackPrice}
      />
    </div>
  </section>
);
