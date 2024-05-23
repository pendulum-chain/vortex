import React, { useState, useEffect } from 'react';
import { IAnchorSessionParams, ISep24Intermediate, Sep24Result } from '../services/anchor';
import { sep24First, sep24Second } from '../services/anchor';
import { EventStatus } from './GenericEvent';
import { Button } from 'react-daisyui';
interface Sep24Props {
  maxOfframpBalance: number;
  sessionParams: IAnchorSessionParams | null;
  onSep24Complete: (sep24Reslt: Sep24Result) => void;
  addEvent: (message: string, status: EventStatus) => void;
}

interface Sep24ProcessStatus {
  processStarted: boolean;
  waitingSep24Second: boolean;
}

const Sep24: React.FC<Sep24Props> = ({ sessionParams, onSep24Complete, addEvent, maxOfframpBalance }) => {
  const [iframe, iframeOpened] = useState<boolean>(false);
  const [sep24IntermediateValues, setSep24IntermediateValues] = useState<ISep24Intermediate | null>(null);
  const [processStatus, setProcessStatus] = useState<Sep24ProcessStatus>({
    processStarted: false,
    waitingSep24Second: false,
  });

  // we want this to run only once when the component mounts
  useEffect(() => {
    const startProcess = () => {
      if (sessionParams) {
        sep24First(sessionParams, addEvent).then((response) => {
          setSep24IntermediateValues(response);
          iframeOpened(true);
        });
      }
    };
    if (!processStatus?.processStarted) {
      startProcess();
      setProcessStatus({
        processStarted: true,
        waitingSep24Second: false,
      });
    }
  }, [sessionParams, addEvent, processStatus]);

  const handleIframeCompletion = () => {
    // at this point setSep24IntermediateValues should not be null, as well as
    // sessionParams
    iframeOpened(false);
    sep24Second(sep24IntermediateValues!, sessionParams!, addEvent).then((response) => {
      onSep24Complete(response);
    });
    addEvent('Waiting for confirmation from Anchor', EventStatus.Waiting);
    setProcessStatus({ processStarted: true, waitingSep24Second: true });
  };

  return (
    <div>
      {iframe && (
        <div className="iframe-container">
          <Button className="mt-10 mb-10" color="primary" size="lg" onClick={() => {
               window.open(`${sep24IntermediateValues!.url}`, '_blank') 
          }} >Enter bank details (New window). Max offramp value is {maxOfframpBalance}</Button>
          <Button className="mt-10 mb-10" color="primary" size="lg" onClick={() => handleIframeCompletion()}>Start Offramping</Button>
        </div>
      )}
    </div>
  );
};

export default Sep24;
