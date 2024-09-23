interface LowerSummaryCardProps {
  label: string;
  amount: string;
  icon: string | null;
  symbol: string | null;
  colSpan: number;
  remarked?: boolean;
}

export const LowerSummaryCard = ({ label, amount, icon, symbol, colSpan, remarked }: LowerSummaryCardProps) => (
  <div
    className={`px-3 py-1 h-auto flex flex-col justify-between space-y-0 rounded ${
      remarked ? 'bg-blue-100 bg-opacity-50' : ''
    }`}
  >
    <div className="place-self-start">
      <span className="text-xs md:text-sm font-thin">{label}</span>
    </div>
    <div className="flex items-center w-full">
      <span className="text-xs md:text-lg mr-1">{amount}</span>
      <div className="flex items-center">
        {icon && <img src={icon} className="w-3 md:w-5 h-3 md:h-5" />}
        {symbol && <span className="ml-1 text-xs md:text-lg">{symbol}</span>}
      </div>
    </div>
  </div>
);
