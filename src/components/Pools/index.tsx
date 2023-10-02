export type PoolProgressProps = {
  symbol: string;
  amount: number;
  className?: string;
};

export const PoolProgress = ({ symbol, amount, className = '' }: PoolProgressProps) => {
  return (
    <div
      className={`flex items-center justify-between rounded-lg bg-neutral-100 dark:bg-neutral-700 p-4 mt-6 ${className}`}
    >
      <div className="text-lg">
        <strong>{symbol}</strong>
      </div>
      <div className="text-3xl font-2">{amount}</div>
    </div>
  );
};
