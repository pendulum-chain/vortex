interface FeeComparisonTableProps {}

function FeeComparisonTable(props: FeeComparisonTableProps) {
  return (
    <div className="grow w-full rounded-lg shadow-custom">
      <h1>Fee Comparison</h1>
    </div>
  );
}

interface FeeComparisonProps {}

export function FeeComparison({}: FeeComparisonProps) {
  return (
    <div className="flex items-center flex-col md:flex-row gap-x-8 gap-y-8 max-w-4xl px-4 py-8 rounded-lg md:mx-auto md:w-3/4">
      <div className="grow w-full overflow-auto gap-6">
        <h1 className="text-2xl font-bold">Save on exchange rate markups</h1>
        <p className="text-lg mt-4">
          The cost of your transfer comes from the fee and the exchange rate. Many providers offer “no fee”, while
          hiding a markup in the exchange rate, making you pay more.
        </p>
        <p className="text-lg mt-4">At Vortex, we’ll never do that and show our fees upfront.</p>
      </div>
      <FeeComparisonTable />
    </div>
  );
}
