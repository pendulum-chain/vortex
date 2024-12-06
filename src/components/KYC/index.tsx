import React, { useState } from 'react';

import { flows as ballerineFlows } from '@ballerine/web-ui-sdk';
import { ballerineInitConfig } from '../../config/ballerina';

export const Kyc = () => {
  const [isFlowInitialized, setIsFlowInitialized] = useState(false);

  const handleStartKyc = async () => {
    try {
      await ballerineFlows.init(ballerineInitConfig);
      console.log('Flows initialized');

      ballerineFlows.mount({ flowName: 'my-kyc-flow', elementId: 'flow-host-element' });

      setIsFlowInitialized(true);
    } catch (error) {
      console.error('Error initializing or mounting the Ballerine flows', error);
    }
  };

  return (
    <div>
      <button onClick={handleStartKyc}>Start KYC</button>
      <div id="flow-host-element" style={{ marginTop: '20px' }}></div>
    </div>
  );
};
