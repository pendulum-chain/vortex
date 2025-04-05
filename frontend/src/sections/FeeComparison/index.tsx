import { type FC, forwardRef } from 'react';
import { useTranslation, Trans } from 'react-i18next';

import { FeeComparisonTable } from './FeeComparisonTable';
import {
  useSwapFromTokenDetails,
  useSwapToTokenDetails,
  useSwapFromAmount,
  useSwapSelectedNetwork,
} from '../../stores/offrampFormStore';
import { useCalculateToken } from '../../pages/ramp-form/hooks/useCalculateToken';
import { useSwapForm } from '../../components/Nabla/useSwapForm';
import { Networks } from '../../helpers/networks';

export interface BaseComparisonProps {
  amount: Big;
  sourceAssetSymbol: string;
  targetAssetSymbol: string;
  vortexPrice: Big;
  network: Networks;
  trackQuote: boolean;
  children?: React.ReactNode;
  ref?: React.RefObject<HTMLDivElement | null>;
}

export const FeeComparison = () => {
  return <div>FeeComparison</div>;
};

// export const FeeComparison = forwardRef<HTMLDivElement>((_props, ref) => {
//   const { t } = useTranslation();

//   // Get all data from stores and hooks
//   const fromToken = useSwapFromTokenDetails();
//   const toToken = useSwapToTokenDetails();
//   const fromAmount = useSwapFromAmount();
//   const selectedNetwork = useSwapSelectedNetwork();
//   const { form } = useSwapForm();

//   // Get safe from and to tokens
//   const safeFromToken = fromToken?.type || 'usdc';
//   const safeToToken = toToken?.fiat?.symbol || 'eurc';

//   // Get vortex price from calculation hook
//   const { vortexPrice } = useCalculateToken(safeFromToken, safeToToken, fromAmount?.toString() || '0', form);

//   // Only render when we have necessary data
//   if (!fromAmount || !fromToken || !toToken) {
//     return null;
//   }

//   return (
//     <section
//       ref={ref}
//       className="py-24 mt-10 mb-24 bg-[radial-gradient(at_74%_98%,theme(colors.blue.900),theme(colors.blue.950),theme(colors.blue.950))]"
//     >
//       <div className="container grid md:grid-cols-2 grid-cols-1 px-4 py-8 gap-x-20 mx-auto">
//         <div className="text-white">
//           <h1 className="text-4xl">
//             <Trans i18nKey="sections.feeComparison.title">
//               <strong className="text-blue-400">Save</strong> on exchange rate markups
//             </Trans>
//           </h1>
//           <p className="mt-4 text-lg">
//             <Trans i18nKey="sections.feeComparison.description">
//               The cost of your transfer comes from the fee and the exchange rate. Many providers offer
//               <em className="font-bold text-blue-400">”no fee”</em>, while hiding a markup in the exchange rate, making
//               you pay more.
//             </Trans>
//           </p>
//           <p className="mt-4 text-lg">{t('sections.feeComparison.description2')}</p>
//         </div>
//         <FeeComparisonTable
//           amount={fromAmount}
//           sourceAssetSymbol={fromToken.assetSymbol}
//           targetAssetSymbol={toToken.fiat.symbol}
//           vortexPrice={vortexPrice}
//           network={selectedNetwork}
//           trackQuote={true}
//         />
//       </div>
//     </section>
//   );
// });
