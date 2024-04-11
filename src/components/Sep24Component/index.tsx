import React, { useState, useEffect } from 'react';
import { Container } from '@mui/material';
import {IAnchorSessionParams, ISep24Intermediate, ISep24Result} from '../../services/anchor';
import { sep24First, sep24Second } from '../../services/anchor';
interface Sep24Props {
    sessionParams:  IAnchorSessionParams | null;
    onSep24Complete: (sep24Reslt: ISep24Result) => void;
}

interface Sep24ProcessStatus {
    processStarted: boolean;
    waitingSep24Second: boolean;
}

const Sep24: React.FC<Sep24Props> = ({ sessionParams, onSep24Complete }) => {
  const [iframe, iframeOpened] = useState<boolean>(false);
  const [sep24IntermediateValues, setSep24IntermediateValues] = useState<ISep24Intermediate | null>(null);
  const [processStatus, setProcessStatus] = useState<Sep24ProcessStatus>({
                                                                          processStarted: false,  
                                                                          waitingSep24Second: false});

  useEffect(() => {
    if (!processStatus?.processStarted) {
      //will this be called exactly when the component is mounted?
      startProcess();
      setProcessStatus({
        processStarted: true,
        waitingSep24Second: false
      }); 
    }
  }, []); 

  const startProcess = () => {
    console.log('Sep Process started');
    // we could validate that seession params is not null
    if (sessionParams) {
      sep24First(sessionParams).then((response) => {
        setSep24IntermediateValues(response)
        iframeOpened(true);

      });
      
    }
    
  };

  const handleIframeCompletion = () => {
    // at this point setSep24IntermediateValues should not be null, as well as 
    // sessionParams
    iframeOpened(false);
    sep24Second(sep24IntermediateValues!, sessionParams!).then((response) => {
      console.log('Sep24 Second completed', response);
      onSep24Complete(response);
    
    });
    setProcessStatus({processStarted: true, waitingSep24Second: true})
  }


  return (
    <div>
        {iframe && (
          <Container>
            <iframe src={sep24IntermediateValues!.url} title="External Content" style={{ width: "50%", height: "400px" }}></iframe>
            <button onClick={() => handleIframeCompletion()}>I'm Done</button>
          </Container>
        )}
        {processStatus.waitingSep24Second && <p>Waiting for process to be completed</p>}
    </div>
  );
}

export default Sep24;
