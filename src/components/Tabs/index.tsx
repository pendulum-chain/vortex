import { FC } from 'preact/compat';

import './styles.css';

const Tabs: FC = () => {
  return (
    <div className="date-tabs">
      <ul>
        <li className="active">1D</li>
        <li>1W</li>
        <li>1Y</li>
        <li>All</li>
      </ul>
    </div>
  );
};

export default Tabs;
