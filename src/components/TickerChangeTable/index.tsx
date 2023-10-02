import usdc from '../../assets/usdc.png';
import './styles.css';

const TickerChangeTable = () => (
  <div className="ticker-change-table" style={{ marginTop: 40 }}>
    <div className="row">
      <div className="cell icon">
        <img src={usdc} alt="Pendulum" style={{ filter: 'invert(1)' }} />
      </div>
      <div className="cell">
        <span className="bold">PEN</span>
        <br />
        Pendulum
      </div>
      <div className="cell">
        $0.125
        <br />
        48.405,33
      </div>
      <div className="cell">
        <span className="bold">$6060,66</span> <br />
        <span className="up">+10.56%</span>
      </div>
    </div>
    <div className="row">
      <div className="cell icon">
        <img src={usdc} alt="USDC" />
      </div>
      <div className="cell">
        <span className="bold">USDC</span> <br />
        USD Coin
      </div>
      <div className="cell">
        $9,98
        <br />
        4.112,00
      </div>
      <div className="cell">
        <span className="bold">$4112,33</span> <br />
        <span className="down">-0.9%</span>
      </div>
    </div>
  </div>
);

export default TickerChangeTable;
