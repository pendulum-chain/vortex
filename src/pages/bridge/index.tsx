import { useMemo, useState } from 'preact/hooks';
import { Card, Tabs } from 'react-daisyui';
import { useNodeInfoState } from '../../NodeInfoProvider';
import { SpacewalkConstants } from '../../helpers/spacewalk';
import Issue from './Issue';
import Redeem from './Redeem';
import './styles.css';

function Bridge(): JSX.Element | null {
  const [tabValue, setTabValue] = useState(0);
  const { chain } = useNodeInfoState().state;
  const nativeCurrency = chain === 'Amplitude' ? 'AMPE' : 'PEN';
  const wrappedCurrencySuffix = SpacewalkConstants.WrappedCurrencySuffix;

  const Content = useMemo(() => {
    if (!chain) return;
    switch (tabValue) {
      case 0:
        return <Issue network={chain} nativeCurrency={nativeCurrency} wrappedCurrencySuffix={wrappedCurrencySuffix} />;
      case 1:
        return <Redeem network={chain} nativeCurrency={nativeCurrency} wrappedCurrencySuffix={wrappedCurrencySuffix} />;
    }
  }, [chain, nativeCurrency, tabValue, wrappedCurrencySuffix]);

  return chain ? (
    <div className="h-full flex items-center justify-center mt-4">
      <Card className="bridge-card min-h-500 w-full max-w-[520px]">
        <div className="flex justify-between px-4 xs:px-10 mt-5">
          <Tabs className="flex flex-grow" boxed value={tabValue} onChange={setTabValue}>
            <Tabs.Tab className="w-2/4 h-fit p-2" value={0}>
              To {chain}
            </Tabs.Tab>
            <Tabs.Tab className="w-2/4 h-fit p-2" value={1}>
              Back To Stellar
            </Tabs.Tab>
          </Tabs>
        </div>
        {Content}
      </Card>
    </div>
  ) : (
    <></>
  );
}

export default Bridge;
