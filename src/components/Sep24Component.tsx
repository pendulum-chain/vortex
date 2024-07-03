import React, { useState } from 'react';
import { IAnchorSessionParams, ISep24Intermediate, Sep24Result } from '../services/anchor';
import { sep24First, sep24Second } from '../services/anchor';
import { EventStatus } from './GenericEvent';
import { Button } from 'react-daisyui';

interface Sep24Props {
  sessionParams: IAnchorSessionParams | null;
  onSep24Complete: (sep24Reslt: Sep24Result) => void;
  setAnchorSessionParams: (params: IAnchorSessionParams) => void;
  addEvent: (message: string, status: EventStatus) => void;
}

const Sep24: React.FC<Sep24Props> = ({ sessionParams, onSep24Complete, addEvent }) => {
  const [externalWindowClicked, setExternalWindowClicked] = useState<boolean>(false);
  const [sep24IntermediateValues, setSep24IntermediateValues] = useState<ISep24Intermediate | null>(null);

  const onExternalWindowClicked = () => {
    if (sessionParams) {
      sep24First(sessionParams, addEvent).then((response) => {
        window.open(`${response.url}`, '_blank');
        setSep24IntermediateValues(response);
      });
    }

    setExternalWindowClicked(true);
  };

  const handleIframeCompletion = () => {
    // at this point setSep24IntermediateValues should not be null, as well as
    // sessionParams
    sep24Second(sep24IntermediateValues!, sessionParams!, addEvent).then((response) => {
      onSep24Complete(response);
    });
    addEvent('Waiting for confirmation from Anchor', EventStatus.Waiting);
  };

  return (
    <div>
      <div className="iframe-container">
        {!externalWindowClicked && (
          <Button className="mt-10 mb-10" color="primary" size="lg" onClick={onExternalWindowClicked}>
            Enter bank details (New window).
          </Button>
        )}
        {externalWindowClicked && (
          <Button className="mt-10 mb-10" color="primary" size="lg" onClick={() => handleIframeCompletion()}>
            Start Offramping
          </Button>
        )}
      </div>
    </div>
  );
};

export default Sep24;
