import React, { useState, useEffect } from 'react';
import { Container } from '@mui/material';
import {IAnchorSessionParams} from '../../services/anchor';
import { sep24First, sep24Second } from '../../services/anchor';
interface Sep24Props {
    sessionParams:  IAnchorSessionParams;
}

const Sep24: React.FC<Sep24Props> = ({ sessionParams }) => {
  const [iframe, iframeOpened] = useState<boolean>(false);
  const [processStarted, setProcessStarted] = useState<boolean>(false);

  useEffect(() => {
    if (!processStarted) {
      startProcess();
      setProcessStarted(true); 
    }
  }, []); 

  const startProcess = () => {
    console.log('Sep Process started');
    sep24First(sessionParams);
    iframeOpened(true);
  };

  const handleIframeCompletion = () => {
    iframeOpened(false);
    // continue with sep 24 waiting, need to fetch id
    sep24Second('id', input);
  }


  return (
    <div className="inputBox">
        {iframe && (
        <Container>
          <iframe src="https://example.com" title="External Content" style={{ width: "100%", height: "400px" }}></iframe>
          <button onClick={() => handleIframeCompletion()}>I'm Done</button>
        </Container>
      )}
    </div>
  );
}

export default Sep24;
