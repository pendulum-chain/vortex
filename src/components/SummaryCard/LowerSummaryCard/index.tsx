interface LowerSummaryCardProps {
  label: string;
  amount: string;
  startIcon?: string | JSX.Element;
  endIcon?: string | JSX.Element;
  symbol?: string;
  remarked?: boolean;
}

export const LowerSummaryCard = ({ label, amount, startIcon, endIcon, symbol, remarked }: LowerSummaryCardProps) => (
  <div
    className={`px-3 py-1 h-auto flex flex-col justify-between space-y-0 rounded ${
      remarked ? 'bg-blue-100 bg-opacity-50' : ''
    }`}
  >
    <div className="place-self-start">
      <span className="text-xs md:text-sm font-thin">{label}</span>
    </div>
    <div className="flex items-center w-full">
      <div className="pr-1 p-0">
        {startIcon && typeof startIcon === 'string' ? (
          <img src={startIcon} className="w-3 md:w-5 h-3 md:h-5" />
        ) : (
          startIcon
        )}
      </div>
      <span className="text-xs md:text-lg mr-1">{amount}</span>
      <div className="flex items-center">
        {endIcon && typeof endIcon === 'string' ? <img src={endIcon} className="w-3 md:w-5 h-3 md:h-5" /> : endIcon}
        {symbol && <span className="ml-1 text-xs md:text-lg">{symbol}</span>}
      </div>
    </div>
  </div>
);
