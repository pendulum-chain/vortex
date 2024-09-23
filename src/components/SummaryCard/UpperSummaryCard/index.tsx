interface UpperSummaryCardProps {
  label: string;
  amount: string;
  icon: string;
  symbol: string;
}

export const UpperSummaryCard = ({ label, amount, icon, symbol }: UpperSummaryCardProps) => (
  <div className="border rounded px-3 py-1 h-auto flex flex-col justify-between space-y-0">
    <div className="place-self-start">
      <span className="text-xs md:text-sm font-thin">{label}</span>
    </div>
    <div className="flex justify-between items-center w-full">
      <span className="text-md md:text-xl font-medium text-blue-800">{amount}</span>
      <div className="flex items-center mr-2">
        <img src={icon} className="w-4 md:w-6 h-4 md:h-6" />
        <span className="ml-1 text-blue-800">{symbol}</span>
      </div>
    </div>
  </div>
);
