import { FC } from 'preact/compat';
import { useGetIcon } from '../../hooks/useGetIcon';
import { InputTokenType, OutputTokenType, INPUT_TOKEN_CONFIG, OUTPUT_TOKEN_CONFIG} from '../../constants/tokenConfig';
import Big from 'big.js';
import { calculateTotalReceive } from '../FeeCollapse';
import { roundDownToSignificantDecimals } from '../../helpers/parseNumbers';

export interface SummaryCardProps {
  assetIn: InputTokenType;
  assetOut: OutputTokenType;
  fromAmount: Big;
  toAmount: Big;
}

export const SummaryCard : FC<SummaryCardProps> = ({
    assetIn,
    assetOut,
    fromAmount,
    toAmount,
  }) => {

    const assetInSymbol = INPUT_TOKEN_CONFIG[assetIn].assetSymbol;
    const assetOutSymbol = OUTPUT_TOKEN_CONFIG[assetOut].fiat.symbol;

    const assetInIcon = useGetIcon(INPUT_TOKEN_CONFIG[assetIn].polygonAssetIcon);
    const assetOutIcon = useGetIcon(OUTPUT_TOKEN_CONFIG[assetOut].fiat.assetIcon);

    const receiveAmount = calculateTotalReceive( toAmount.toString(), OUTPUT_TOKEN_CONFIG[assetOut]);

    const approximateExchangeRate = roundDownToSignificantDecimals(toAmount.div(fromAmount),2).toString();
    const offrampFees = roundDownToSignificantDecimals(toAmount.sub(receiveAmount), 2).toString();

    return (

      <div className="bg-white p-4 rounded-lg shadow-lg w-full">
        <div className="grid grid-cols-2 gap-4 mb-2">
          <div className="border rounded p-1 h-auto flex flex-col justify-between space-y-0">
            <div className="place-self-start">
              <span className="text-sm font-thin">You withdraw</span>
            </div>
            <div className="flex justify-between items-center w-full">
              <span className="text-xl font-medium text-blue-800"> {roundDownToSignificantDecimals(fromAmount, 2).toString()} </span>
              <div className="flex items-center mr-2">
                <img src={assetInIcon} className="w-6 h-6" />
                <span className="ml-1 text-blue-800">{assetInSymbol}</span>
              </div>
            </div>
          </div>
          <div className="border rounded p-1 h-auto flex flex-col justify-between space-y-0">
            <div className="place-self-start">
              <span className="text-sm font-thin ">You receive</span> 
            </div>
            <div className="flex justify-between items-center w-full">
              <span className="text-xl font-medium text-blue-800"> {receiveAmount} </span>
              <div className="flex items-center mr-2">
                <img src={assetOutIcon}  className="w-6 h-6" />
                <span className="ml-1 text-blue-800">{assetOutSymbol}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-10 gap-4">
          <div className="col-span-3 p-1 h-auto flex flex-col justify-between space-y-0 rounded bg-blue-100 bg-opacity-50">
            <div className="place-self-start">
              <span className="text-xs font-thin">Your quote</span>
            </div>
            <div className="flex items-center w-full">
              <span className="text-xs md:text-lg mr-1"> {roundDownToSignificantDecimals(toAmount, 2).toString()} </span>
              <div className="flex items-center">
                <img src={assetOutIcon} className="w-3 md:w-5 h-3 md:h-5" />
                <span className="ml-1 text-xs md:text-lg">{assetOutSymbol}</span>
              </div>
            </div>
          </div>
          
          <div className="col-span-4 p-1 h-auto flex flex-col justify-between space-y-0">
            <div className="place-self-start">
              <span className="text-xs font-thin">Exchange rate</span>
            </div>
            <div className="flex justify-between items-center w-full">
              <span className="text-xs md:text-lg">1 {assetInSymbol} ≈ {approximateExchangeRate} {assetOutSymbol}</span>
            </div>
          </div>

          <div className="col-span-3 p-1 h-auto flex flex-col justify-between space-y-0">
            <div className="place-self-start">
              <span className="text-xs font-thin">Offramp fees</span>
            </div>
            <div className="flex items-center w-full">
              <span className="text-xs md:text-lg mr-1">{offrampFees}</span>
              <img src={assetOutIcon}  className="w-3 md:w-5 h-3 md:h-5" />
              <span className="ml-1 text-xs md:text-lg">{assetOutSymbol}</span>
            </div>
          </div>
        </div>
      </div>
    );
};
