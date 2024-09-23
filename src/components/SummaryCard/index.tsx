import { FC } from 'preact/compat';
import { useGetIcon } from '../../hooks/useGetIcon';
import { InputTokenType, OutputTokenType, INPUT_TOKEN_CONFIG, OUTPUT_TOKEN_CONFIG } from '../../constants/tokenConfig';
import Big from 'big.js';
import { calculateTotalReceive } from '../FeeCollapse';
import { roundDownToSignificantDecimals } from '../../helpers/parseNumbers';
import { UpperSummaryCard } from './UpperSummaryCard';
import { LowerSummaryCard } from './LowerSummaryCard';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
export interface SummaryCardProps {
  assetIn: InputTokenType;
  assetOut: OutputTokenType;
  fromAmount: Big;
  toAmount: Big;
}

export const SummaryCard: FC<SummaryCardProps> = ({ assetIn, assetOut, fromAmount, toAmount }) => {
  const assetInSymbol = INPUT_TOKEN_CONFIG[assetIn].assetSymbol;
  const assetOutSymbol = OUTPUT_TOKEN_CONFIG[assetOut].fiat.symbol;

  const assetInIcon = useGetIcon(INPUT_TOKEN_CONFIG[assetIn].polygonAssetIcon);
  const assetOutIcon = useGetIcon(OUTPUT_TOKEN_CONFIG[assetOut].fiat.assetIcon);

  const receiveAmount = calculateTotalReceive(toAmount.toString(), OUTPUT_TOKEN_CONFIG[assetOut]);

  const approximateExchangeRate = roundDownToSignificantDecimals(toAmount.div(fromAmount), 2).toString();
  const offrampFees = roundDownToSignificantDecimals(toAmount.sub(receiveAmount), 2).toString();

  return (
    <div className="bg-white card p-4 rounded-lg border w-full shadow">
      <div className="grid grid-cols-2 gap-4 mb-2">
        <UpperSummaryCard
          label="You withdraw"
          amount={roundDownToSignificantDecimals(fromAmount, 2).toString()}
          icon={assetInIcon}
          symbol={assetInSymbol}
        />
        <UpperSummaryCard label="You receive" amount={receiveAmount} icon={assetOutIcon} symbol={assetOutSymbol} />
      </div>

      <div className="grid grid-cols-10 gap-4">
        <div className="col-span-3">
          <LowerSummaryCard
            label="Your quote"
            amount={roundDownToSignificantDecimals(toAmount, 2).toString()}
            endIcon={assetOutIcon}
            symbol={assetOutSymbol}
            remarked={true}
          />
        </div>
        <div className="col-span-4">
          <LowerSummaryCard
            label="Exchange rate"
            amount={`1 ${assetInSymbol} ≈ ${approximateExchangeRate} ${assetOutSymbol}`}
          />
        </div>
        <div className="col-span-3">
          <LowerSummaryCard
            label="Offramp fees"
            amount={offrampFees}
            startIcon={<LocalGasStationIcon className="text-blue-700" fontSize="small" />}
            endIcon={assetOutIcon}
            symbol={assetOutSymbol}
          />
        </div>
      </div>
    </div>
  );
};
