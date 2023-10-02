import { Button } from 'react-daisyui';

import usdc from '../../assets/usdc.png';
import Box from '../../components/Box';
import './styles.css';

function Amm(): JSX.Element {
  const Dummy = () => (
    <>
      <div className="row-pick-coin">
        <Button
          animation={false}
          startIcon={<img src={usdc} alt="usdc" style={{ width: 20, height: 20 }} />}
          endIcon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              style={{ width: 20, height: 20, marginLeft: 10, maxWidth: 15 }}
              viewBox="0 0 448 512"
            >
              <path
                className="fill-gray-400"
                d="M224 416c-8.188 0-16.38-3.125-22.62-9.375l-192-192c-12.5-12.5-12.5-32.75 0-45.25s32.75-12.5 45.25 0L224 338.8l169.4-169.4c12.5-12.5 32.75-12.5 45.25 0s12.5 32.75 0 45.25l-192 192C240.4 412.9 232.2 416 224 416z"
              />
            </svg>
          }
        >
          usd coin
        </Button>
        <p className="text-4xl font-bold">300</p>
      </div>
      <div className="row-pick-coin">
        <p>Balance: 3000 USDC</p>
        <p>~3000.00$</p>
      </div>
    </>
  );

  return (
    <div className="flex items-center justify-center h-full amm">
      <div style={{ width: 500 }}>
        <Box title="Swap">
          <div className="amm-wrapper">
            <Dummy />
            <div className="max">
              <button>max</button>
              <hr />
              <div className="circle">&darr;</div>
            </div>
            <Dummy />
          </div>
          <div className="parity">
            <p>1 LINK = 14,222332348182733 USDT</p>
            <Button color="success">preview swap</Button>
          </div>
        </Box>
      </div>
    </div>
  );
}

export default Amm;
