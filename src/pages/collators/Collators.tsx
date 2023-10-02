import CollatorRewards from './CollatorRewards';
import CollatorsTable from './CollatorsTable';

function Collators() {
  return (
    <div className="overflow-x-auto collators-list-container">
      <CollatorRewards />
      <CollatorsTable />
    </div>
  );
}

export default Collators;
