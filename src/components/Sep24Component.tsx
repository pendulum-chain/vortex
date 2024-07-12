import React, { useEffect, useState } from 'react';
import { IAnchorSessionParams, SepResult } from '../services/anchor';
import { sep24First, sep24Second } from '../services/anchor';
import { EventStatus } from './GenericEvent';
import { Button } from 'react-daisyui';

interface Sep24Props {
  sessionParams: IAnchorSessionParams | null;
  onSep24Complete: (sep24Reslt: SepResult) => void;
  addEvent: (message: string, status: EventStatus) => void;
}

const Sep24: React.FC<Sep24Props> = ({ sessionParams, onSep24Complete, addEvent }) => {
  const [sep24Url, setSep24Url] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (sessionParams) {
      (async () => {
        const firstResponse = await sep24First(sessionParams, addEvent);
        setSep24Url(firstResponse.url);
        const secondResponse = await sep24Second(firstResponse, sessionParams);
        onSep24Complete(secondResponse);
      })();

      addEvent('Waiting for confirmation from Anchor', EventStatus.Waiting);
    }
  }, [sessionParams]);

  return (
    <div>
      <div className="iframe-container">
        {sep24Url && (
          <a href={sep24Url} target="_blank">
            <Button className="md:my-10 my-4" color="primary" size="lg">
              Enter bank details (New window).
            </Button>
          </a>
        )}
      </div>
    </div>
  );
};

export default Sep24;
